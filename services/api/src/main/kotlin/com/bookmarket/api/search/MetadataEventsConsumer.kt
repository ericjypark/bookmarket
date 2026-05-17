package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkRepository
import com.bookmarket.api.events.ProcessedEventRepository
import com.bookmarket.api.operational.MetadataJobStatusCache
import com.bookmarket.api.operational.PublicProfileCache
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.annotation.KafkaListener
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["bookmarket.kafka.enabled"], havingValue = "true")
class MetadataEventsConsumer(
    private val objectMapper: ObjectMapper,
    private val bookmarkRepository: BookmarkRepository,
    private val searchService: SearchService,
    private val metadataJobStatusCache: MetadataJobStatusCache,
    private val publicProfileCache: PublicProfileCache,
    private val processedEventRepository: ProcessedEventRepository
) {
    private val logger = LoggerFactory.getLogger(MetadataEventsConsumer::class.java)

    @KafkaListener(
        topics = ["\${bookmarket.kafka.metadata-events-topic}"],
        groupId = "\${bookmarket.kafka.metadata-events-consumer-group}"
    )
    fun consume(message: String) {
        val envelope = objectMapper.readValue(message, MetadataEventEnvelope::class.java)
        if (envelope.eventType !in supportedEventTypes) {
            logger.debug("Ignoring metadata event type {}", envelope.eventType)
            return
        }

        val bookmarkId = UUID.fromString(envelope.payload.path("bookmarkId").asText())
        val bookmarkWithOwner = bookmarkRepository.findByIdWithOwner(bookmarkId)
        if (bookmarkWithOwner == null) {
            logger.info("Skipping metadata event {} for missing bookmark {}", envelope.eventId, bookmarkId)
            return
        }

        if (!processedEventRepository.record(envelope.eventId, envelope.idempotencyKey, consumerName)) {
            logger.debug("Skipping duplicate metadata event {}", envelope.eventId)
            return
        }

        val status = bookmarkRepository.metadataStatus(bookmarkWithOwner.ownerId, bookmarkId)
        metadataJobStatusCache.put(bookmarkWithOwner.ownerId, status)
        searchService.indexBookmark(bookmarkWithOwner.bookmark, bookmarkWithOwner.ownerId)
        publicProfileCache.evictAllPublicProfiles()
    }

    private data class MetadataEventEnvelope(
        val eventId: String,
        val eventType: String,
        val idempotencyKey: String,
        val payload: JsonNode
    )

    private companion object {
        const val consumerName = "services/api:metadata-events"
        val supportedEventTypes = setOf("metadata.fetch.completed", "metadata.fetch.failed")
    }
}
