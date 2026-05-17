package com.bookmarket.api.auth

import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Clock
import java.util.UUID

@Repository
class ApiTokenRepository(
    private val jdbcTemplate: JdbcTemplate,
    private val clock: Clock = Clock.systemUTC()
) {
    fun list(userId: UUID): List<ApiTokenDto> =
        jdbcTemplate.query(
            """
            SELECT id, name, token_prefix, scopes, created_at, last_used_at
            FROM api_tokens
            WHERE user_id = ?::uuid AND revoked_at IS NULL
            ORDER BY created_at DESC, id DESC
            """.trimIndent(),
            apiTokenMapper,
            userId.toString()
        )

    fun create(userId: UUID, name: String, tokenPrefix: String, tokenHash: String, scopes: List<String>): ApiTokenDto =
        jdbcTemplate.query(
            { connection ->
                val statement = connection.prepareStatement(
                    """
                    INSERT INTO api_tokens (user_id, name, token_prefix, token_hash, scopes)
                    VALUES (?::uuid, ?, ?, ?, ?)
                    RETURNING id, name, token_prefix, scopes, created_at, last_used_at
                    """.trimIndent()
                )
                statement.setString(1, userId.toString())
                statement.setString(2, name)
                statement.setString(3, tokenPrefix)
                statement.setString(4, tokenHash)
                statement.setArray(5, connection.createArrayOf("text", scopes.toTypedArray()))
                statement
            },
            apiTokenMapper
        ).firstOrNull() ?: throw IllegalStateException("API token insert did not return a row")

    fun revoke(userId: UUID, id: UUID): Boolean =
        jdbcTemplate.update(
            """
            UPDATE api_tokens
            SET revoked_at = now()
            WHERE user_id = ?::uuid AND id = ?::uuid AND revoked_at IS NULL
            """.trimIndent(),
            userId.toString(),
            id.toString()
        ) > 0

    fun findActiveByHash(tokenHash: String): ApiTokenAuthRecord? =
        jdbcTemplate.query(
            """
            SELECT user_id, scopes
            FROM api_tokens
            WHERE token_hash = ?
              AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > ?)
            LIMIT 1
            """.trimIndent(),
            apiTokenAuthMapper,
            tokenHash,
            Timestamp.from(clock.instant())
        ).firstOrNull()

    fun markUsed(tokenHash: String) {
        jdbcTemplate.update(
            """
            UPDATE api_tokens
            SET last_used_at = now()
            WHERE token_hash = ? AND revoked_at IS NULL
            """.trimIndent(),
            tokenHash
        )
    }

    companion object {
        private val apiTokenMapper = RowMapper { rs: ResultSet, _: Int ->
            ApiTokenDto(
                id = rs.getObject("id", UUID::class.java).toString(),
                name = rs.getString("name"),
                tokenPrefix = rs.getString("token_prefix"),
                scopes = rs.textArray("scopes"),
                createdAt = rs.getTimestamp("created_at").toInstant(),
                lastUsedAt = rs.getTimestamp("last_used_at")?.toInstant()
            )
        }

        private val apiTokenAuthMapper = RowMapper { rs: ResultSet, _: Int ->
            ApiTokenAuthRecord(
                userId = rs.getObject("user_id", UUID::class.java).toString(),
                scopes = rs.textArray("scopes")
            )
        }

        private fun ResultSet.textArray(column: String): List<String> =
            (getArray(column)?.array as? Array<*>)
                ?.map { it.toString() }
                ?: emptyList()
    }
}
