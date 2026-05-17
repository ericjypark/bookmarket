package com.bookmarket.api.operational

import com.bookmarket.api.bookmarks.MetadataJobStatusDto
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component
import java.util.UUID

@Component
class MetadataJobStatusCache(
    private val redis: RedisOperationalState,
    private val properties: OperationalStateProperties,
    private val objectMapper: ObjectMapper
) {
    fun get(userId: UUID, bookmarkId: UUID): MetadataJobStatusDto? =
        redis.get(key(userId, bookmarkId))
            ?.let { objectMapper.readValue(it, MetadataJobStatusDto::class.java) }

    fun put(userId: UUID, status: MetadataJobStatusDto) {
        redis.set(
            key(userId, UUID.fromString(status.bookmarkId)),
            objectMapper.writeValueAsString(status),
            properties.metadataJobStatusTtlSeconds
        )
    }

    private fun key(userId: UUID, bookmarkId: UUID): String =
        "metadata-job:$userId:$bookmarkId"
}
