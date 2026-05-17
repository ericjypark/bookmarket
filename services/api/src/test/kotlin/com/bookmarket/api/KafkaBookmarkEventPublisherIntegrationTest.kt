package com.bookmarket.api

import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.bookmarks.BookmarkEventPublisher
import com.fasterxml.jackson.databind.ObjectMapper
import org.apache.kafka.clients.consumer.ConsumerConfig
import org.apache.kafka.clients.consumer.KafkaConsumer
import org.apache.kafka.common.serialization.StringDeserializer
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.kafka.core.KafkaTemplate
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.containers.KafkaContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.time.Duration
import java.time.Instant
import java.util.Properties
import java.util.UUID

@SpringBootTest(
    properties = [
        "bookmarket.kafka.enabled=true",
        "bookmarket.kafka.bookmark-events-topic=bookmark.events",
        "bookmarket.kafka.metadata-jobs-topic=metadata.jobs",
        "spring.kafka.producer.key-serializer=org.apache.kafka.common.serialization.StringSerializer",
        "spring.kafka.producer.value-serializer=org.apache.kafka.common.serialization.StringSerializer"
    ]
)
@Testcontainers
class KafkaBookmarkEventPublisherIntegrationTest {
    @Autowired
    lateinit var publisher: BookmarkEventPublisher

    @Autowired
    lateinit var kafkaTemplate: KafkaTemplate<String, String>

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Test
    fun `kafka publisher emits bookmark and metadata event envelopes`() {
        val bookmark = BookmarkDto(
            id = UUID.randomUUID().toString(),
            url = "https://kafka.example/${UUID.randomUUID()}",
            title = "Kafka bookmark",
            description = "Kafka metadata",
            faviconUrl = "https://kafka.example/favicon.ico",
            metadataStatus = "PENDING",
            createdAt = Instant.parse("2026-05-16T00:00:00Z"),
            updatedAt = Instant.parse("2026-05-16T00:00:00Z"),
            category = null
        )
        val userId = UUID.randomUUID().toString()

        newConsumer().use { consumer ->
            consumer.subscribe(listOf("bookmark.events", "metadata.jobs"))

            publisher.bookmarkCreated(bookmark, userId, metadataVersion = 1)
            publisher.metadataFetchRequested(bookmark, userId, metadataVersion = 1, requestedBy = "bookmark.create")
            kafkaTemplate.flush()

            val messages = pollUntil(consumer, expectedMessages = 2)
            val bookmarkEvent = messages.single { it.topic == "bookmark.events" }
            val metadataJob = messages.single { it.topic == "metadata.jobs" }

            assertEquals(bookmark.id, bookmarkEvent.key)
            assertEquals("bookmark.created", bookmarkEvent.body.path("eventType").asText())
            assertEquals("services/api", bookmarkEvent.body.path("producer").asText())
            assertEquals(bookmark.id, bookmarkEvent.body.path("subject").path("id").asText())
            assertEquals(userId, bookmarkEvent.body.path("payload").path("userId").asText())
            assertEquals(1, bookmarkEvent.body.path("payload").path("metadataVersion").asInt())

            assertEquals(bookmark.id, metadataJob.key)
            assertEquals("metadata.fetch.requested", metadataJob.body.path("eventType").asText())
            assertEquals("bookmark:${bookmark.id}:metadata:1", metadataJob.body.path("idempotencyKey").asText())
            assertEquals(bookmark.url, metadataJob.body.path("payload").path("url").asText())
            assertEquals("bookmark.create", metadataJob.body.path("payload").path("requestedBy").asText())
        }
    }

    private fun newConsumer(): KafkaConsumer<String, String> {
        val props = Properties().apply {
            put(ConsumerConfig.BOOTSTRAP_SERVERS_CONFIG, kafka.bootstrapServers)
            put(ConsumerConfig.GROUP_ID_CONFIG, "bookmarket-api-test-${UUID.randomUUID()}")
            put(ConsumerConfig.AUTO_OFFSET_RESET_CONFIG, "earliest")
            put(ConsumerConfig.KEY_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
            put(ConsumerConfig.VALUE_DESERIALIZER_CLASS_CONFIG, StringDeserializer::class.java)
        }
        return KafkaConsumer(props)
    }

    private fun pollUntil(consumer: KafkaConsumer<String, String>, expectedMessages: Int): List<KafkaMessage> {
        val deadline = Instant.now().plusSeconds(15)
        val messages = mutableListOf<KafkaMessage>()
        while (Instant.now().isBefore(deadline) && messages.size < expectedMessages) {
            consumer.poll(Duration.ofMillis(500)).forEach { record ->
                messages.add(
                    KafkaMessage(
                        topic = record.topic(),
                        key = record.key(),
                        body = objectMapper.readTree(record.value())
                    )
                )
            }
        }
        assertTrue(messages.size >= expectedMessages, "Expected $expectedMessages Kafka messages, got ${messages.size}")
        return messages
    }

    data class KafkaMessage(
        val topic: String,
        val key: String,
        val body: com.fasterxml.jackson.databind.JsonNode
    )

    companion object {
        @Container
        @JvmStatic
        val kafka = KafkaContainer(DockerImageName.parse("confluentinc/cp-kafka:7.9.0"))

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.kafka.bootstrap-servers", kafka::getBootstrapServers)
        }
    }
}
