package com.bookmarket.api.auth

import com.bookmarket.api.common.ApiException
import com.bookmarket.api.users.UserProfileDto
import com.bookmarket.api.users.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import java.util.UUID

@Service
class ApiTokenService(
    private val apiTokenRepository: ApiTokenRepository,
    private val userRepository: UserRepository
) {
    fun list(userId: UUID): List<ApiTokenDto> =
        apiTokenRepository.list(userId)

    fun create(userId: UUID, request: CreateApiTokenRequest): CreateApiTokenResponse {
        val name = request.name.trim()
        if (name.isBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "API_TOKEN_NAME_REQUIRED", "Token name is required")
        }
        val scopes = normalizeScopes(request.scopes)
        val plainToken = createPlainToken()
        val metadata = apiTokenRepository.create(
            userId = userId,
            name = name,
            tokenPrefix = plainToken.take(14),
            tokenHash = hash(plainToken),
            scopes = scopes
        )
        return CreateApiTokenResponse(token = plainToken, tokenMetadata = metadata)
    }

    fun revoke(userId: UUID, id: UUID) {
        val revoked = apiTokenRepository.revoke(userId, id)
        if (!revoked) {
            throw ApiException(HttpStatus.NOT_FOUND, "API_TOKEN_NOT_FOUND", "API token not found")
        }
    }

    fun authenticate(plainToken: String, requiredScopes: Set<String> = emptySet()): UserProfileDto {
        val tokenHash = hash(plainToken)
        val record = apiTokenRepository.findActiveByHash(tokenHash)
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid API token")
        if (!record.scopes.containsAll(requiredScopes)) {
            throw ApiException(HttpStatus.FORBIDDEN, "API_TOKEN_SCOPE_MISSING", "API token does not have the required scope")
        }
        apiTokenRepository.markUsed(tokenHash)
        return userRepository.findUserById(UUID.fromString(record.userId))
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "User not found")
    }

    fun isApiToken(value: String): Boolean =
        value.startsWith(TokenPrefix)

    private fun normalizeScopes(scopes: List<String>): List<String> {
        val normalized = scopes.map { it.trim().lowercase() }.filter { it.isNotBlank() }.distinct()
        if (normalized.isEmpty()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "API_TOKEN_SCOPES_REQUIRED", "At least one scope is required")
        }
        val unknownScopes = normalized.filterNot { it in AllowedScopes }
        if (unknownScopes.isNotEmpty()) {
            throw ApiException(
                HttpStatus.BAD_REQUEST,
                "API_TOKEN_SCOPE_INVALID",
                "Unsupported API token scope",
                mapOf("scopes" to unknownScopes)
            )
        }
        return normalized
    }

    private fun createPlainToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return TokenPrefix + base64UrlEncoder.encodeToString(bytes)
    }

    private fun hash(value: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(value.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    companion object {
        const val TokenPrefix = "bmkt_"
        const val ScopeBookmarksRead = "bookmarks:read"
        const val ScopeBookmarksWrite = "bookmarks:write"
        const val ScopeProfileRead = "profile:read"

        private val AllowedScopes = setOf(ScopeBookmarksRead, ScopeBookmarksWrite, ScopeProfileRead)
        private val secureRandom = SecureRandom()
        private val base64UrlEncoder = Base64.getUrlEncoder().withoutPadding()
    }
}
