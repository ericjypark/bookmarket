package com.bookmarket.api.categories

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.util.UUID

@Repository
class CategoryRepository(
    private val jdbcTemplate: JdbcTemplate
) {
    fun create(userId: UUID, name: String): CategoryDto {
        if (findByName(userId, name) != null) {
            throw ApiException(HttpStatus.CONFLICT, "CATEGORY_ALREADY_EXISTS", "Category with name $name already exists")
        }

        return jdbcTemplate.queryForObject(
            """
            INSERT INTO categories (user_id, name)
            VALUES (?::uuid, ?)
            RETURNING id, name, created_at, updated_at
            """.trimIndent(),
            categoryMapper,
            userId.toString(),
            name.trim()
        ) ?: throw IllegalStateException("Category insert did not return a row")
    }

    fun findAll(userId: UUID): List<CategoryDto> =
        jdbcTemplate.query(
            """
            SELECT id, name, created_at, updated_at
            FROM categories
            WHERE user_id = ?::uuid
            ORDER BY created_at ASC, id ASC
            """.trimIndent(),
            categoryMapper,
            userId.toString()
        )

    fun findById(userId: UUID, id: UUID): CategoryDto? =
        jdbcTemplate.query(
            """
            SELECT id, name, created_at, updated_at
            FROM categories
            WHERE user_id = ?::uuid AND id = ?::uuid
            LIMIT 1
            """.trimIndent(),
            categoryMapper,
            userId.toString(),
            id.toString()
        ).firstOrNull()

    fun findByName(userId: UUID, name: String): CategoryDto? =
        jdbcTemplate.query(
            """
            SELECT id, name, created_at, updated_at
            FROM categories
            WHERE user_id = ?::uuid AND lower(name) = lower(?)
            LIMIT 1
            """.trimIndent(),
            categoryMapper,
            userId.toString(),
            name.trim()
        ).firstOrNull()

    fun update(userId: UUID, id: UUID, name: String): CategoryDto {
        if (findByName(userId, name)?.id?.let { UUID.fromString(it) }?.let { it != id } == true) {
            throw ApiException(HttpStatus.CONFLICT, "CATEGORY_ALREADY_EXISTS", "Category with name $name already exists")
        }

        return jdbcTemplate.query(
            """
            UPDATE categories
            SET name = ?
            WHERE user_id = ?::uuid AND id = ?::uuid
            RETURNING id, name, created_at, updated_at
            """.trimIndent(),
            categoryMapper,
            name.trim(),
            userId.toString(),
            id.toString()
        ).firstOrNull() ?: throw ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found")
    }

    fun delete(userId: UUID, id: UUID) {
        val deleted = jdbcTemplate.update(
            "DELETE FROM categories WHERE user_id = ?::uuid AND id = ?::uuid",
            userId.toString(),
            id.toString()
        )
        if (deleted == 0) {
            throw ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found")
        }
    }

    fun findPublicCategories(ownerUserId: UUID): List<CategoryDto> =
        findAll(ownerUserId)

    companion object {
        val categoryMapper = RowMapper { rs: ResultSet, _: Int ->
            CategoryDto(
                id = rs.getObject("id", UUID::class.java).toString(),
                name = rs.getString("name"),
                createdAt = rs.getTimestamp("created_at").toInstant(),
                updatedAt = rs.getTimestamp("updated_at").toInstant()
            )
        }
    }
}
