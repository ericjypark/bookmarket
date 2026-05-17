package com.bookmarket.api.auth

import com.bookmarket.api.common.ApiException
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.time.Clock
import java.time.Instant
import java.util.Base64
import java.util.UUID
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

@Component
class TokenService(
    private val authProperties: AuthProperties,
    private val objectMapper: ObjectMapper,
    private val clock: Clock = Clock.systemUTC()
) {
    private val base64UrlEncoder = Base64.getUrlEncoder().withoutPadding()
    private val base64UrlDecoder = Base64.getUrlDecoder()

    fun createAccessToken(userId: UUID): String {
        val now = clock.instant().epochSecond
        val payload = mapOf(
            "sub" to userId.toString(),
            "id" to userId.toString(),
            "iss" to authProperties.issuer,
            "aud" to authProperties.audience,
            "iat" to now,
            "exp" to now + authProperties.accessTokenTtlSeconds
        )
        return sign(payload)
    }

    fun verifyAccessToken(token: String): UUID {
        val payload = verify(token)
        val subject = payload["sub"] as? String
            ?: throw invalidToken("AUTH_INVALID", "Invalid access token")
        return try {
            UUID.fromString(subject)
        } catch (exception: IllegalArgumentException) {
            throw invalidToken("AUTH_INVALID", "Invalid access token")
        }
    }

    fun createRefreshToken(): String {
        val bytes = ByteArray(48)
        secureRandom.nextBytes(bytes)
        return base64UrlEncoder.encodeToString(bytes)
    }

    fun hashRefreshToken(refreshToken: String): String =
        sha256(refreshToken)

    fun refreshTokenExpiresAt(): Instant =
        clock.instant().plusSeconds(authProperties.refreshTokenTtlSeconds)

    private fun sign(payload: Map<String, Any>): String {
        val header = mapOf("alg" to "HS256", "typ" to "JWT")
        val headerPart = encodeJson(header)
        val payloadPart = encodeJson(payload)
        val signingInput = "$headerPart.$payloadPart"
        val signature = hmacSha256(signingInput)
        return "$signingInput.$signature"
    }

    private fun verify(token: String): Map<String, Any> {
        val parts = token.split(".")
        if (parts.size != 3) throw invalidToken("AUTH_INVALID", "Invalid access token")

        val signingInput = "${parts[0]}.${parts[1]}"
        val expected = hmacSha256(signingInput)
        if (!MessageDigest.isEqual(expected.toByteArray(StandardCharsets.UTF_8), parts[2].toByteArray(StandardCharsets.UTF_8))) {
            throw invalidToken("AUTH_INVALID", "Invalid access token")
        }

        val payloadJson = String(base64UrlDecoder.decode(parts[1]), StandardCharsets.UTF_8)
        val payload = objectMapper.readValue(payloadJson, object : TypeReference<Map<String, Any>>() {})

        val issuer = payload["iss"] as? String
        val audience = payload["aud"] as? String
        if (issuer != authProperties.issuer || audience != authProperties.audience) {
            throw invalidToken("AUTH_INVALID", "Invalid access token")
        }

        val exp = (payload["exp"] as? Number)?.toLong()
            ?: throw invalidToken("AUTH_INVALID", "Invalid access token")
        if (exp <= clock.instant().epochSecond) {
            throw invalidToken("TOKEN_EXPIRED", "Access token expired")
        }

        return payload
    }

    private fun encodeJson(value: Any): String =
        base64UrlEncoder.encodeToString(objectMapper.writeValueAsBytes(value))

    private fun hmacSha256(input: String): String {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(authProperties.secret.toByteArray(StandardCharsets.UTF_8), "HmacSHA256"))
        return base64UrlEncoder.encodeToString(mac.doFinal(input.toByteArray(StandardCharsets.UTF_8)))
    }

    private fun sha256(input: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(input.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }

    private fun invalidToken(code: String, message: String): ApiException =
        ApiException(HttpStatus.UNAUTHORIZED, code, message)

    companion object {
        private val secureRandom = java.security.SecureRandom()
    }
}
