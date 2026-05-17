package com.bookmarket.api.events

import org.springframework.dao.DuplicateKeyException
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.stereotype.Repository

@Repository
class ProcessedEventRepository(
    private val jdbcTemplate: JdbcTemplate
) {
    fun record(eventId: String, idempotencyKey: String, consumer: String): Boolean =
        try {
            jdbcTemplate.update(
                """
                INSERT INTO processed_events (event_id, idempotency_key, consumer)
                VALUES (?::uuid, ?, ?)
                """.trimIndent(),
                eventId,
                idempotencyKey,
                consumer
            )
            true
        } catch (exception: DuplicateKeyException) {
            false
        }
}
