package com.bookmarket.api.operational

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.SecureRandom
import java.util.Base64

@Service
class OAuthStateService(
    private val redis: RedisOperationalState,
    private val properties: OperationalStateProperties
) {
    private val secureRandom = SecureRandom()

    fun create(provider: String, pkceVerifier: String? = null): String {
        if (!redis.enabled()) {
            throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OAUTH_STATE_UNAVAILABLE", "OAuth state storage is unavailable")
        }

        repeat(3) {
            val state = randomUrlSafeToken()
            if (redis.setIfAbsent(key(provider, state), pkceVerifier.orEmpty(), properties.oauthStateTtlSeconds)) {
                return state
            }
        }

        throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "OAUTH_STATE_UNAVAILABLE", "OAuth state storage is unavailable")
    }

    fun consume(provider: String, state: String): String? {
        val redisKey = key(provider, state)
        val verifier = redis.get(redisKey)
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid OAuth state")
        redis.delete(redisKey)
        return verifier.takeIf { it.isNotBlank() }
    }

    private fun randomUrlSafeToken(): String {
        val bytes = ByteArray(32)
        secureRandom.nextBytes(bytes)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
    }

    private fun key(provider: String, state: String): String =
        "oauth-state:${provider.lowercase()}:$state"
}
