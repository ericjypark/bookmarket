package com.bookmarket.api.users

import com.bookmarket.api.auth.RefreshTokenRecord
import com.bookmarket.api.auth.UserAuthRecord
import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.ResultSet
import java.sql.Timestamp
import java.time.Instant
import java.util.UUID

@Repository
class UserRepository(
    private val jdbcTemplate: JdbcTemplate,
    transactionManager: PlatformTransactionManager
) {
    private val transactionTemplate = TransactionTemplate(transactionManager)

    fun countUsers(): Int =
        jdbcTemplate.queryForObject("SELECT count(*) FROM users", Int::class.java) ?: 0

    fun createEmailUser(email: String, passwordHash: String, username: String, maxUsers: Int): UserProfileDto =
        transactionTemplate.execute {
            jdbcTemplate.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
            val currentCount = jdbcTemplate.queryForObject("SELECT count(*) FROM users", Int::class.java) ?: 0
            if (currentCount >= maxUsers) {
                throw ApiException(
                    HttpStatus.FORBIDDEN,
                    "SIGNUP_SLOTS_FULL",
                    "No more signup slots available. Maximum of 100 users reached."
                )
            }
            val profile = jdbcTemplate.queryForObject(
                """
                INSERT INTO users (email, username, first_name, last_name, is_public)
                VALUES (?, ?, 'Bookmarket', 'User', true)
                RETURNING id, email, username, first_name, last_name, picture_url, is_public
                """.trimIndent(),
                userProfileMapper,
                email,
                username
            ) ?: throw IllegalStateException("User insert did not return a row")

            jdbcTemplate.update(
                """
                INSERT INTO auth_accounts (user_id, provider, email, password_hash)
                VALUES (?::uuid, 'email'::auth_provider, ?, ?)
                """.trimIndent(),
                profile.id,
                email,
                passwordHash
            )

            jdbcTemplate.update(
                """
                INSERT INTO public_profiles (user_id, username, is_public, display_name)
                VALUES (?::uuid, ?, true, ?)
                """.trimIndent(),
                profile.id,
                username,
                "${profile.firstName} ${profile.lastName}"
            )

            profile
        } ?: throw IllegalStateException("User creation transaction returned no profile")

    fun findEmailAccount(email: String): UserAuthRecord? =
        jdbcTemplate.query(
            """
            SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.picture_url, u.is_public, aa.password_hash
            FROM auth_accounts aa
            JOIN users u ON u.id = aa.user_id
            WHERE aa.provider = 'email'::auth_provider AND lower(aa.email) = lower(?)
            LIMIT 1
            """.trimIndent(),
            userAuthMapper,
            email
        ).firstOrNull()

    fun findOAuthAccount(provider: String, providerSubject: String): UserProfileDto? =
        jdbcTemplate.query(
            """
            SELECT u.id, u.email, u.username, u.first_name, u.last_name, u.picture_url, u.is_public
            FROM auth_accounts aa
            JOIN users u ON u.id = aa.user_id
            WHERE aa.provider = ?::auth_provider AND aa.provider_subject = ?
            LIMIT 1
            """.trimIndent(),
            userProfileMapper,
            provider,
            providerSubject
        ).firstOrNull()

    fun createOrLinkOAuthUser(
        provider: String,
        providerSubject: String,
        email: String,
        firstName: String?,
        lastName: String?,
        pictureUrl: String?,
        username: String,
        maxUsers: Int
    ): UserProfileDto =
        transactionTemplate.execute {
            findOAuthAccount(provider, providerSubject)?.let { existing ->
                updateOAuthProfile(existing.id, firstName, lastName, pictureUrl)
                return@execute findUserById(UUID.fromString(existing.id)) ?: existing
            }

            jdbcTemplate.execute("LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE")
            val existingByEmail = findUserByEmail(email)
            val profile = existingByEmail ?: createOAuthUser(email, firstName, lastName, pictureUrl, username, maxUsers)

            jdbcTemplate.update(
                """
                INSERT INTO auth_accounts (user_id, provider, provider_subject, email)
                VALUES (?::uuid, ?::auth_provider, ?, ?)
                ON CONFLICT (provider, provider_subject)
                WHERE provider_subject IS NOT NULL
                DO NOTHING
                """.trimIndent(),
                profile.id,
                provider,
                providerSubject,
                email.trim().lowercase()
            )

            updateOAuthProfile(profile.id, firstName, lastName, pictureUrl)
            findUserById(UUID.fromString(profile.id)) ?: profile
        } ?: throw IllegalStateException("OAuth user transaction returned no profile")

    fun findUserById(userId: UUID): UserProfileDto? =
        jdbcTemplate.query(
            """
            SELECT id, email, username, first_name, last_name, picture_url, is_public
            FROM users
            WHERE id = ?::uuid
            """.trimIndent(),
            userProfileMapper,
            userId.toString()
        ).firstOrNull()

    private fun findUserByEmail(email: String): UserProfileDto? =
        jdbcTemplate.query(
            """
            SELECT id, email, username, first_name, last_name, picture_url, is_public
            FROM users
            WHERE lower(email) = lower(?)
            LIMIT 1
            """.trimIndent(),
            userProfileMapper,
            email.trim().lowercase()
        ).firstOrNull()

    private fun createOAuthUser(
        email: String,
        firstName: String?,
        lastName: String?,
        pictureUrl: String?,
        username: String,
        maxUsers: Int
    ): UserProfileDto {
        val currentCount = jdbcTemplate.queryForObject("SELECT count(*) FROM users", Int::class.java) ?: 0
        if (currentCount >= maxUsers) {
            throw ApiException(
                HttpStatus.FORBIDDEN,
                "SIGNUP_SLOTS_FULL",
                "No more signup slots available. Maximum of 100 users reached."
            )
        }
        val profile = jdbcTemplate.queryForObject(
            """
            INSERT INTO users (email, username, first_name, last_name, picture_url, is_public)
            VALUES (?, ?, ?, ?, ?, true)
            RETURNING id, email, username, first_name, last_name, picture_url, is_public
            """.trimIndent(),
            userProfileMapper,
            email.trim().lowercase(),
            username,
            firstName ?: "Bookmarket",
            lastName ?: "User",
            pictureUrl
        ) ?: throw IllegalStateException("OAuth user insert did not return a row")

        jdbcTemplate.update(
            """
            INSERT INTO public_profiles (user_id, username, is_public, display_name)
            VALUES (?::uuid, ?, true, ?)
            """.trimIndent(),
            profile.id,
            username,
            listOfNotNull(profile.firstName, profile.lastName).joinToString(" ").ifBlank { null }
        )

        return profile
    }

    private fun updateOAuthProfile(userId: String, firstName: String?, lastName: String?, pictureUrl: String?) {
        jdbcTemplate.update(
            """
            UPDATE users
            SET first_name = COALESCE(?, first_name),
                last_name = COALESCE(?, last_name),
                picture_url = COALESCE(?, picture_url)
            WHERE id = ?::uuid
            """.trimIndent(),
            firstName,
            lastName,
            pictureUrl,
            userId
        )
    }

    fun findPublicProfileByUsername(username: String): PublicProfileDto {
        val record = jdbcTemplate.query(
            """
            SELECT u.id,
                   COALESCE(pp.username, u.username) AS username,
                   u.first_name,
                   u.last_name,
                   u.picture_url,
                   u.is_public AS user_is_public,
                   COALESCE(pp.is_public, u.is_public) AS profile_is_public
            FROM users u
            LEFT JOIN public_profiles pp ON pp.user_id = u.id
            WHERE lower(u.username) = lower(?) OR lower(pp.username) = lower(?)
            LIMIT 1
            """.trimIndent(),
            publicProfileMapper,
            username,
            username
        ).firstOrNull() ?: throw ApiException(HttpStatus.NOT_FOUND, "PUBLIC_PROFILE_NOT_FOUND", "User does not exist")

        if (!record.isPublic) {
            throw ApiException(HttpStatus.FORBIDDEN, "PUBLIC_PROFILE_PRIVATE", "This user's profile is private")
        }
        return record
    }

    fun isUsernameAvailable(username: String): Boolean {
        val count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM users WHERE lower(username) = lower(?)",
            Int::class.java,
            username
        ) ?: 0
        return count == 0
    }

    fun isUsernameAvailableForUser(userId: UUID, username: String): Boolean {
        val normalized = username.lowercase()
        val currentUsername = jdbcTemplate.queryForObject(
            "SELECT lower(username) FROM users WHERE id = ?::uuid",
            String::class.java,
            userId.toString()
        )
        if (currentUsername == normalized) return true

        val count = jdbcTemplate.queryForObject(
            "SELECT count(*) FROM users WHERE lower(username) = lower(?)",
            Int::class.java,
            username
        ) ?: 0
        return count == 0
    }

    fun updateUser(userId: UUID, request: UpdateUserProfileRequest): UserProfileDto =
        transactionTemplate.execute {
            val profile = jdbcTemplate.query(
                """
                UPDATE users
                SET username = COALESCE(?, username),
                    first_name = COALESCE(?, first_name),
                    last_name = COALESCE(?, last_name),
                    is_public = COALESCE(?, is_public)
                WHERE id = ?::uuid
                RETURNING id, email, username, first_name, last_name, picture_url, is_public
                """.trimIndent(),
                userProfileMapper,
                request.username,
                request.firstName,
                request.lastName,
                request.isPublic,
                userId.toString()
            ).firstOrNull() ?: throw IllegalArgumentException("User not found")

            jdbcTemplate.update(
                """
                UPDATE public_profiles
                SET username = ?, is_public = ?, display_name = ?
                WHERE user_id = ?::uuid
                """.trimIndent(),
                profile.username,
                profile.isPublic,
                listOfNotNull(profile.firstName, profile.lastName).joinToString(" ").ifBlank { null },
                userId.toString()
            )

            profile
        } ?: throw IllegalStateException("User update transaction returned no profile")

    fun saveRefreshToken(userId: UUID, tokenHash: String, familyId: UUID, expiresAt: Instant): UUID =
        jdbcTemplate.queryForObject(
            """
            INSERT INTO refresh_tokens (user_id, token_hash, token_family_id, expires_at)
            VALUES (?::uuid, ?, ?::uuid, ?)
            RETURNING id
            """.trimIndent(),
            UUID::class.java,
            userId.toString(),
            tokenHash,
            familyId.toString(),
            Timestamp.from(expiresAt)
        ) ?: throw IllegalStateException("Refresh token insert did not return an id")

    fun findRefreshToken(tokenHash: String): RefreshTokenRecord? =
        jdbcTemplate.query(
            """
            SELECT rt.id AS token_id,
                   rt.user_id,
                   rt.token_family_id,
                   rt.expires_at,
                   rt.revoked_at,
                   u.id,
                   u.email,
                   u.username,
                   u.first_name,
                   u.last_name,
                   u.picture_url,
                   u.is_public
            FROM refresh_tokens rt
            JOIN users u ON u.id = rt.user_id
            WHERE rt.token_hash = ?
            LIMIT 1
            """.trimIndent(),
            refreshTokenMapper,
            tokenHash
        ).firstOrNull()

    fun rotateRefreshToken(record: RefreshTokenRecord, newHash: String, newExpiresAt: Instant): UUID =
        transactionTemplate.execute {
            val newTokenId = saveRefreshToken(record.userId, newHash, record.familyId, newExpiresAt)
            jdbcTemplate.update(
                """
                UPDATE refresh_tokens
                SET revoked_at = now(), replaced_by_token_id = ?::uuid
                WHERE id = ?::uuid AND revoked_at IS NULL
                """.trimIndent(),
                newTokenId.toString(),
                record.id.toString()
            )
            newTokenId
        } ?: throw IllegalStateException("Refresh token rotation returned no id")

    fun revokeRefreshToken(tokenHash: String) {
        jdbcTemplate.update(
            "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = ? AND revoked_at IS NULL",
            tokenHash
        )
    }

    companion object {
        val userProfileMapper = RowMapper { rs: ResultSet, _: Int ->
            UserProfileDto(
                id = rs.getObject("id", UUID::class.java).toString(),
                email = rs.getString("email"),
                username = rs.getString("username"),
                firstName = rs.getString("first_name"),
                lastName = rs.getString("last_name"),
                pictureUrl = rs.getString("picture_url"),
                isPublic = rs.getBoolean("is_public")
            )
        }

        private val userAuthMapper = RowMapper { rs: ResultSet, _: Int ->
            UserAuthRecord(
                profile = userProfileMapper.mapRow(rs, 0)!!,
                passwordHash = rs.getString("password_hash")
            )
        }

        private val refreshTokenMapper = RowMapper { rs: ResultSet, _: Int ->
            RefreshTokenRecord(
                id = rs.getObject("token_id", UUID::class.java),
                userId = rs.getObject("user_id", UUID::class.java),
                familyId = rs.getObject("token_family_id", UUID::class.java),
                expiresAt = rs.getTimestamp("expires_at").toInstant(),
                revokedAt = rs.getTimestamp("revoked_at")?.toInstant(),
                profile = userProfileMapper.mapRow(rs, 0)!!
            )
        }

        private val publicProfileMapper = RowMapper { rs: ResultSet, _: Int ->
            PublicProfileDto(
                id = rs.getObject("id", UUID::class.java).toString(),
                username = rs.getString("username"),
                firstName = rs.getString("first_name"),
                lastName = rs.getString("last_name"),
                pictureUrl = rs.getString("picture_url"),
                isPublic = rs.getBoolean("user_is_public") && rs.getBoolean("profile_is_public")
            )
        }
    }
}
