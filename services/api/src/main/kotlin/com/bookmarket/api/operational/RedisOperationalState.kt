package com.bookmarket.api.operational

import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.stereotype.Component
import java.time.Duration

@Component
class RedisOperationalState(
    private val redisTemplate: StringRedisTemplate,
    private val properties: OperationalStateProperties
) {
    private val logger = LoggerFactory.getLogger(RedisOperationalState::class.java)

    fun enabled(): Boolean = properties.enabled

    fun get(key: String): String? =
        ifRedisAvailable(null) {
            redisTemplate.opsForValue().get(namespaced(key))
        }

    fun set(key: String, value: String, ttlSeconds: Long) {
        ifRedisAvailable(Unit) {
            redisTemplate.opsForValue().set(namespaced(key), value, Duration.ofSeconds(ttlSeconds))
        }
    }

    fun setIfAbsent(key: String, value: String, ttlSeconds: Long): Boolean =
        ifRedisAvailable(false) {
            redisTemplate.opsForValue().setIfAbsent(namespaced(key), value, Duration.ofSeconds(ttlSeconds)) == true
        }

    fun delete(key: String) {
        ifRedisAvailable(Unit) {
            redisTemplate.delete(namespaced(key))
        }
    }

    fun deleteByPattern(pattern: String) {
        ifRedisAvailable(Unit) {
            val keys = redisTemplate.keys(namespaced(pattern))
            if (!keys.isNullOrEmpty()) {
                redisTemplate.delete(keys)
            }
        }
    }

    fun increment(key: String, ttlSeconds: Long): Long? =
        ifRedisAvailable(null) {
            val redisKey = namespaced(key)
            val count = redisTemplate.opsForValue().increment(redisKey)
            if (count == 1L) {
                redisTemplate.expire(redisKey, Duration.ofSeconds(ttlSeconds))
            }
            count
        }

    fun ttlSeconds(key: String): Long? =
        ifRedisAvailable(null) {
            redisTemplate.getExpire(namespaced(key))
        }

    private fun namespaced(key: String): String =
        "${properties.namespace}:$key"

    private fun <T> ifRedisAvailable(fallback: T, operation: () -> T): T {
        if (!properties.enabled) return fallback
        return try {
            operation()
        } catch (exception: DataAccessException) {
            logger.warn("Redis operational state unavailable; continuing with fallback", exception)
            fallback
        }
    }
}
