package com.bookmarket.api.operational

import com.bookmarket.api.common.ApiException
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.security.MessageDigest
import java.util.UUID
import javax.servlet.http.HttpServletRequest

@Service
class IdempotencyService(
    private val redis: RedisOperationalState,
    private val properties: OperationalStateProperties,
    private val objectMapper: ObjectMapper
) {
    fun <T : Any> execute(
        servletRequest: HttpServletRequest,
        userId: UUID,
        command: Any?,
        responseType: Class<T>,
        block: () -> T
    ): T {
        val idempotencyKey = servletRequest.getHeader("Idempotency-Key")?.trim()?.takeIf { it.isNotBlank() }
            ?: return block()
        if (!redis.enabled()) return block()

        val recordKey = "idempotency:${userId}:${sha256(idempotencyKey)}"
        val requestHash = requestHash(servletRequest, command)
        val placeholder = StoredIdempotencyRecord(requestHash = requestHash, status = "IN_PROGRESS")
        val reserved = redis.setIfAbsent(
            recordKey,
            objectMapper.writeValueAsString(placeholder),
            properties.idempotencyTtlSeconds
        )

        if (!reserved) {
            val existing = loadRecord(recordKey)
            if (existing.requestHash != requestHash) {
                throw ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Idempotency key was reused for a different request")
            }
            if (existing.status != "COMPLETED" || existing.responseBody == null) {
                throw ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Idempotent request is already in progress")
            }
            return objectMapper.treeToValue(existing.responseBody, responseType)
        }

        return try {
            val response = block()
            redis.set(
                recordKey,
                objectMapper.writeValueAsString(
                    StoredIdempotencyRecord(
                        requestHash = requestHash,
                        status = "COMPLETED",
                        responseBody = objectMapper.valueToTree(response)
                    )
                ),
                properties.idempotencyTtlSeconds
            )
            response
        } catch (exception: RuntimeException) {
            redis.delete(recordKey)
            throw exception
        }
    }

    private fun loadRecord(recordKey: String): StoredIdempotencyRecord =
        redis.get(recordKey)
            ?.let { objectMapper.readValue(it, StoredIdempotencyRecord::class.java) }
            ?: throw ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "Idempotent request is already in progress")

    private fun requestHash(servletRequest: HttpServletRequest, command: Any?): String =
        sha256(
            listOf(
                servletRequest.method,
                servletRequest.requestURI,
                servletRequest.queryString.orEmpty(),
                command?.let { objectMapper.writeValueAsString(it) }.orEmpty()
            ).joinToString("\n")
        )

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { "%02x".format(it) }
    }

    private data class StoredIdempotencyRecord(
        val requestHash: String = "",
        val status: String = "",
        val responseBody: JsonNode? = null
    )
}
