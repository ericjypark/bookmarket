package com.bookmarket.api.bookmarks

import com.bookmarket.api.categories.CategoryDto
import com.bookmarket.api.common.ApiException
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.ResultSet
import java.util.UUID

@Repository
class BookmarkRepository(
    private val jdbcTemplate: JdbcTemplate,
    transactionManager: PlatformTransactionManager
) {
    private val transactionTemplate = TransactionTemplate(transactionManager)

    fun create(userId: UUID, normalizedUrl: NormalizedBookmarkUrl, categoryId: UUID?): BookmarkWithMetadataVersion =
        transactionTemplate.execute {
            val bookmarkId = try {
                jdbcTemplate.queryForObject(
                    """
                    INSERT INTO bookmarks (user_id, category_id, url, normalized_url)
                    VALUES (?::uuid, ?::uuid, ?, ?)
                    RETURNING id
                    """.trimIndent(),
                    UUID::class.java,
                    userId.toString(),
                    categoryId?.toString(),
                    normalizedUrl.originalUrl,
                    normalizedUrl.normalizedUrl
                )
            } catch (exception: DuplicateKeyException) {
                throw ApiException(HttpStatus.CONFLICT, "BOOKMARK_ALREADY_EXISTS", "Bookmark already exists")
            } ?: throw IllegalStateException("Bookmark insert did not return an id")

            jdbcTemplate.update(
                """
                INSERT INTO bookmark_metadata (bookmark_id, status, version)
                VALUES (?::uuid, 'PENDING'::metadata_status, 1)
                """.trimIndent(),
                bookmarkId.toString()
            )

            BookmarkWithMetadataVersion(
                bookmark = findById(userId, bookmarkId)
                    ?: throw IllegalStateException("Created bookmark could not be loaded"),
                metadataVersion = 1
            )
        } ?: throw IllegalStateException("Bookmark creation transaction returned no bookmark")

    fun findAll(userId: UUID, categoryName: String? = null): List<BookmarkDto> {
        val filterByCategory = !categoryName.isNullOrBlank()
        return jdbcTemplate.query(
            """
            SELECT ${bookmarkSelectColumns()}
            FROM bookmarks b
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.user_id = ?::uuid
              AND b.deleted_at IS NULL
              AND (? = false OR lower(c.name) = lower(?))
            ORDER BY b.created_at DESC, b.id DESC
            """.trimIndent(),
            bookmarkMapper,
            userId.toString(),
            filterByCategory,
            categoryName?.trim()
        )
    }

    fun findById(userId: UUID, id: UUID): BookmarkDto? =
        jdbcTemplate.query(
            """
            SELECT ${bookmarkSelectColumns()}
            FROM bookmarks b
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.user_id = ?::uuid AND b.id = ?::uuid AND b.deleted_at IS NULL
            LIMIT 1
            """.trimIndent(),
            bookmarkMapper,
            userId.toString(),
            id.toString()
        ).firstOrNull()

    fun findByIdWithOwner(id: UUID): BookmarkWithOwner? =
        jdbcTemplate.query(
            """
            SELECT b.user_id AS owner_user_id, ${bookmarkSelectColumns()}
            FROM bookmarks b
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.id = ?::uuid AND b.deleted_at IS NULL
            LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                BookmarkWithOwner(
                    ownerId = rs.getObject("owner_user_id", UUID::class.java),
                    bookmark = bookmarkMapper.mapRow(rs, 0)
                        ?: throw IllegalStateException("Bookmark mapper returned null")
                )
            },
            id.toString()
        ).firstOrNull()

    fun findPublic(ownerUserId: UUID, categoryName: String? = null): List<BookmarkDto> =
        findAll(ownerUserId, categoryName)

    fun updateTitle(userId: UUID, id: UUID, title: String?): BookmarkDto {
        val normalizedTitle = title?.trim()?.takeIf { it.isNotBlank() }
        val updated = jdbcTemplate.update(
            """
            UPDATE bookmarks
            SET title_override = ?
            WHERE user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL
            """.trimIndent(),
            normalizedTitle,
            userId.toString(),
            id.toString()
        )
        if (updated == 0) {
            throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
        }
        return findById(userId, id) ?: throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
    }

    fun updateCategory(userId: UUID, id: UUID, categoryId: UUID?): BookmarkDto {
        val updated = jdbcTemplate.update(
            """
            UPDATE bookmarks
            SET category_id = ?::uuid
            WHERE user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL
            """.trimIndent(),
            categoryId?.toString(),
            userId.toString(),
            id.toString()
        )
        if (updated == 0) {
            throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
        }
        return findById(userId, id) ?: throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
    }

    fun delete(userId: UUID, id: UUID) {
        val deleted = jdbcTemplate.update(
            """
            UPDATE bookmarks
            SET deleted_at = now()
            WHERE user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL
            """.trimIndent(),
            userId.toString(),
            id.toString()
        )
        if (deleted == 0) {
            throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
        }
    }

    fun markMetadataPending(userId: UUID, id: UUID): MetadataJobStatusDto {
        if (findById(userId, id) == null) {
            throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
        }

        val version = jdbcTemplate.queryForObject(
            """
            UPDATE bookmark_metadata
            SET status = 'PENDING'::metadata_status,
                version = version + 1,
                failure_code = NULL,
                failure_message = NULL
            WHERE bookmark_id = ?::uuid
            RETURNING version
            """.trimIndent(),
            Int::class.java,
            id.toString()
        ) ?: throw IllegalStateException("Metadata update did not return a version")

        return MetadataJobStatusDto(bookmarkId = id.toString(), metadataStatus = "PENDING", metadataVersion = version)
    }

    fun metadataVersion(bookmarkId: UUID): Int =
        jdbcTemplate.queryForObject(
            "SELECT version FROM bookmark_metadata WHERE bookmark_id = ?::uuid",
            Int::class.java,
            bookmarkId.toString()
        ) ?: 1

    fun metadataStatus(userId: UUID, id: UUID): MetadataJobStatusDto =
        jdbcTemplate.query(
            """
            SELECT bm.bookmark_id, bm.status::text AS metadata_status, bm.version
            FROM bookmark_metadata bm
            JOIN bookmarks b ON b.id = bm.bookmark_id
            WHERE b.user_id = ?::uuid AND b.id = ?::uuid AND b.deleted_at IS NULL
            LIMIT 1
            """.trimIndent(),
            { rs, _ ->
                MetadataJobStatusDto(
                    bookmarkId = rs.getObject("bookmark_id", UUID::class.java).toString(),
                    metadataStatus = rs.getString("metadata_status"),
                    metadataVersion = rs.getInt("version")
                )
            },
            userId.toString(),
            id.toString()
        ).firstOrNull() ?: throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")

    companion object {
        data class BookmarkWithMetadataVersion(
            val bookmark: BookmarkDto,
            val metadataVersion: Int
        )

        data class BookmarkWithOwner(
            val ownerId: UUID,
            val bookmark: BookmarkDto
        )

        fun bookmarkSelectColumns(): String =
            """
            b.id,
            b.url,
            COALESCE(b.title_override, bm.title, b.url) AS title,
            COALESCE(b.description_override, bm.description) AS description,
            bm.favicon_url,
            COALESCE(bm.status::text, 'PENDING') AS metadata_status,
            b.created_at,
            b.updated_at,
            c.id AS category_id,
            c.name AS category_name,
            c.created_at AS category_created_at,
            c.updated_at AS category_updated_at
            """.trimIndent()

        val bookmarkMapper = RowMapper { rs: ResultSet, _: Int ->
            val categoryId = rs.getObject("category_id", UUID::class.java)
            BookmarkDto(
                id = rs.getObject("id", UUID::class.java).toString(),
                url = rs.getString("url"),
                title = rs.getString("title"),
                description = rs.getString("description"),
                faviconUrl = rs.getString("favicon_url"),
                metadataStatus = rs.getString("metadata_status"),
                createdAt = rs.getTimestamp("created_at").toInstant(),
                updatedAt = rs.getTimestamp("updated_at").toInstant(),
                category = categoryId?.let {
                    CategoryDto(
                        id = it.toString(),
                        name = rs.getString("category_name"),
                        createdAt = rs.getTimestamp("category_created_at").toInstant(),
                        updatedAt = rs.getTimestamp("category_updated_at").toInstant()
                    )
                }
            )
        }
    }
}
