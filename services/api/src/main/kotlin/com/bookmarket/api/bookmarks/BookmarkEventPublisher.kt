package com.bookmarket.api.bookmarks

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.stereotype.Component
import java.time.Clock
import java.time.Instant
import java.util.UUID

interface BookmarkEventPublisher {
    fun bookmarkCreated(bookmark: BookmarkDto, userId: String, metadataVersion: Int)
    fun bookmarkUpdated(bookmark: BookmarkDto, userId: String, changedFields: List<String>)
    fun bookmarkDeleted(bookmarkId: String, userId: String)
    fun metadataFetchRequested(bookmark: BookmarkDto, userId: String, metadataVersion: Int, requestedBy: String)
}

@Component
@ConditionalOnProperty(name = ["bookmarket.kafka.enabled"], havingValue = "false", matchIfMissing = true)
class LoggingBookmarkEventPublisher : BookmarkEventPublisher {
    private val logger = LoggerFactory.getLogger(LoggingBookmarkEventPublisher::class.java)

    override fun bookmarkCreated(bookmark: BookmarkDto, userId: String, metadataVersion: Int) {
        logger.info(
            "bookmark.created bookmarkId={} userId={} metadataVersion={} metadataStatus={}",
            bookmark.id,
            userId,
            metadataVersion,
            bookmark.metadataStatus
        )
    }

    override fun bookmarkUpdated(bookmark: BookmarkDto, userId: String, changedFields: List<String>) {
        logger.info(
            "bookmark.updated bookmarkId={} userId={} changedFields={}",
            bookmark.id,
            userId,
            changedFields.joinToString(",")
        )
    }

    override fun bookmarkDeleted(bookmarkId: String, userId: String) {
        logger.info("bookmark.deleted bookmarkId={} userId={}", bookmarkId, userId)
    }

    override fun metadataFetchRequested(bookmark: BookmarkDto, userId: String, metadataVersion: Int, requestedBy: String) {
        logger.info(
            "metadata.fetch.requested bookmarkId={} userId={} metadataVersion={} requestedBy={}",
            bookmark.id,
            userId,
            metadataVersion,
            requestedBy
        )
    }
}

@Component
@ConditionalOnProperty(name = ["bookmarket.kafka.enabled"], havingValue = "true")
class KafkaBookmarkEventPublisher(
    private val kafkaTemplate: KafkaTemplate<String, String>,
    private val objectMapper: ObjectMapper,
    @Value("\${bookmarket.kafka.bookmark-events-topic}") private val bookmarkEventsTopic: String,
    @Value("\${bookmarket.kafka.metadata-jobs-topic}") private val metadataJobsTopic: String,
    private val clock: Clock = Clock.systemUTC()
) : BookmarkEventPublisher {
    private val logger = LoggerFactory.getLogger(KafkaBookmarkEventPublisher::class.java)

    override fun bookmarkCreated(bookmark: BookmarkDto, userId: String, metadataVersion: Int) {
        publish(
            topic = bookmarkEventsTopic,
            key = bookmark.id,
            envelope = envelope(
                eventType = "bookmark.created",
                subjectId = bookmark.id,
                idempotencyKey = "bookmark:${bookmark.id}:created:$metadataVersion",
                payload = BookmarkCreatedPayload(
                    bookmarkId = bookmark.id,
                    userId = userId,
                    url = bookmark.url,
                    categoryId = bookmark.category?.id,
                    metadataVersion = metadataVersion
                )
            )
        )
    }

    override fun bookmarkUpdated(bookmark: BookmarkDto, userId: String, changedFields: List<String>) {
        publish(
            topic = bookmarkEventsTopic,
            key = bookmark.id,
            envelope = envelope(
                eventType = "bookmark.updated",
                subjectId = bookmark.id,
                idempotencyKey = "bookmark:${bookmark.id}:updated:${changedFields.joinToString(",")}:${clock.instant().epochSecond}",
                payload = BookmarkUpdatedPayload(
                    bookmarkId = bookmark.id,
                    userId = userId,
                    changedFields = changedFields
                )
            )
        )
    }

    override fun bookmarkDeleted(bookmarkId: String, userId: String) {
        publish(
            topic = bookmarkEventsTopic,
            key = bookmarkId,
            envelope = envelope(
                eventType = "bookmark.deleted",
                subjectId = bookmarkId,
                idempotencyKey = "bookmark:$bookmarkId:deleted:${clock.instant().epochSecond}",
                payload = BookmarkDeletedPayload(bookmarkId = bookmarkId, userId = userId)
            )
        )
    }

    override fun metadataFetchRequested(bookmark: BookmarkDto, userId: String, metadataVersion: Int, requestedBy: String) {
        publish(
            topic = metadataJobsTopic,
            key = bookmark.id,
            envelope = envelope(
                eventType = "metadata.fetch.requested",
                subjectId = bookmark.id,
                idempotencyKey = "bookmark:${bookmark.id}:metadata:$metadataVersion",
                payload = MetadataFetchRequestedPayload(
                    bookmarkId = bookmark.id,
                    userId = userId,
                    url = bookmark.url,
                    metadataVersion = metadataVersion,
                    requestedBy = requestedBy
                )
            )
        )
    }

    private fun publish(topic: String, key: String, envelope: EventEnvelope<out Any>) {
        val body = objectMapper.writeValueAsString(envelope)
        kafkaTemplate.send(topic, key, body).addCallback(
            { logger.debug("Published {} to {}", envelope.eventType, topic) },
            { exception -> logger.error("Failed to publish {} to {}", envelope.eventType, topic, exception) }
        )
    }

    private fun envelope(
        eventType: String,
        subjectId: String,
        idempotencyKey: String,
        payload: Any
    ): EventEnvelope<Any> =
        EventEnvelope(
            eventId = UUID.randomUUID().toString(),
            eventType = eventType,
            eventVersion = 1,
            occurredAt = clock.instant(),
            producer = "services/api",
            traceId = null,
            idempotencyKey = idempotencyKey,
            subject = EventSubject(type = "bookmark", id = subjectId),
            payload = payload
        )
}

data class EventEnvelope<T>(
    val eventId: String,
    val eventType: String,
    val eventVersion: Int,
    val occurredAt: Instant,
    val producer: String,
    val traceId: String?,
    val idempotencyKey: String,
    val subject: EventSubject,
    val payload: T
)

data class EventSubject(
    val type: String,
    val id: String
)

data class BookmarkCreatedPayload(
    val bookmarkId: String,
    val userId: String,
    val url: String,
    val categoryId: String?,
    val metadataVersion: Int
)

data class BookmarkUpdatedPayload(
    val bookmarkId: String,
    val userId: String,
    val changedFields: List<String>
)

data class BookmarkDeletedPayload(
    val bookmarkId: String,
    val userId: String
)

data class MetadataFetchRequestedPayload(
    val bookmarkId: String,
    val userId: String,
    val url: String,
    val metadataVersion: Int,
    val requestedBy: String
)
