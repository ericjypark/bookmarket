package com.bookmarket.api.operational

import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.stereotype.Component

@Component
class PublicProfileCache(
    private val redis: RedisOperationalState,
    private val properties: OperationalStateProperties,
    private val objectMapper: ObjectMapper
) {
    fun <T : Any> getOrPut(key: String, type: Class<T>, loader: () -> T): T {
        redis.get(key)?.let { return objectMapper.readValue(it, type) }
        val loaded = loader()
        redis.set(key, objectMapper.writeValueAsString(loaded), properties.publicProfileCacheTtlSeconds)
        return loaded
    }

    fun <T : Any> getOrPutList(key: String, elementType: Class<T>, loader: () -> List<T>): List<T> {
        redis.get(key)?.let {
            val javaType = objectMapper.typeFactory.constructCollectionType(List::class.java, elementType)
            return objectMapper.readValue(it, javaType)
        }
        val loaded = loader()
        redis.set(key, objectMapper.writeValueAsString(loaded), properties.publicProfileCacheTtlSeconds)
        return loaded
    }

    fun evictAllPublicProfiles() {
        redis.deleteByPattern("public-profile:*")
    }
}
