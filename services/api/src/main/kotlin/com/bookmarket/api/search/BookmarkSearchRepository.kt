package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.bookmarks.BookmarkRepository
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository
import java.util.UUID

@Repository
class BookmarkSearchRepository(
    private val jdbcTemplate: JdbcTemplate
) {
    fun findAllForReindex(): List<BookmarkSearchDocument> =
        jdbcTemplate.query(
            """
            SELECT b.user_id AS owner_user_id, ${BookmarkRepository.bookmarkSelectColumns()}
            FROM bookmarks b
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.deleted_at IS NULL
            ORDER BY b.created_at DESC, b.id DESC
            """.trimIndent()
        ) { rs, rowNum ->
            BookmarkSearchDocument(
                userId = rs.getObject("owner_user_id", UUID::class.java),
                bookmark = BookmarkRepository.bookmarkMapper.mapRow(rs, rowNum)
                    ?: throw IllegalStateException("Bookmark mapper returned null")
            )
        }

    fun search(userId: UUID, query: String): List<BookmarkDto> {
        val normalizedQuery = query.trim().lowercase()
        if (normalizedQuery.isBlank()) {
            return emptyList()
        }

        val pattern = "%${escapeLike(normalizedQuery)}%"
        return jdbcTemplate.query(
            """
            SELECT ${BookmarkRepository.bookmarkSelectColumns()}
            FROM bookmarks b
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE b.user_id = ?::uuid
              AND b.deleted_at IS NULL
              AND (
                lower(COALESCE(b.title_override, bm.title, b.url)) LIKE ? ESCAPE '\'
                OR lower(b.url) LIKE ? ESCAPE '\'
              )
            ORDER BY b.created_at DESC, b.id DESC
            """.trimIndent(),
            BookmarkRepository.bookmarkMapper,
            userId.toString(),
            pattern,
            pattern
        )
    }

    private fun escapeLike(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("%", "\\%")
            .replace("_", "\\_")

    data class BookmarkSearchDocument(
        val userId: UUID,
        val bookmark: BookmarkDto
    )
}
