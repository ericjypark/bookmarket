package com.bookmarket.api.operational

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import javax.servlet.http.HttpServletRequest

@Service
class RateLimitService(
    private val redis: RedisOperationalState,
    private val properties: OperationalStateProperties
) {
    fun requireAuthAttempt(action: String, request: HttpServletRequest, subject: String?) {
        requireWithinLimit(
            bucket = "auth:$action",
            subject = listOf(clientAddress(request), subject.orEmpty().trim().lowercase()).joinToString(":"),
            maxRequests = properties.authRateLimitMaxRequests,
            windowSeconds = properties.authRateLimitWindowSeconds
        )
    }

    fun requireWithinLimit(bucket: String, subject: String, maxRequests: Long, windowSeconds: Long) {
        if (!redis.enabled()) return
        val key = "rate:${bucket}:${sha256(subject)}"
        val count = redis.increment(key, windowSeconds) ?: return
        if (count > maxRequests) {
            throw ApiException(
                HttpStatus.TOO_MANY_REQUESTS,
                "RATE_LIMITED",
                "Rate limit exceeded",
                mapOf("retryAfterSeconds" to (redis.ttlSeconds(key) ?: windowSeconds))
            )
        }
    }

    private fun clientAddress(request: HttpServletRequest): String =
        request.getHeader("X-Forwarded-For")
            ?.split(",")
            ?.firstOrNull()
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: request.remoteAddr
            ?: "unknown"

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }
}
