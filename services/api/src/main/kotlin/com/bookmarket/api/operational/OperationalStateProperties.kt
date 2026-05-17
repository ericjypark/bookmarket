package com.bookmarket.api.operational

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.ConstructorBinding

@ConstructorBinding
@ConfigurationProperties(prefix = "bookmarket.redis")
data class OperationalStateProperties(
    val enabled: Boolean = false,
    val namespace: String = "bookmarket:v2",
    val authRateLimitMaxRequests: Long = 30,
    val authRateLimitWindowSeconds: Long = 60,
    val idempotencyTtlSeconds: Long = 86_400,
    val metadataJobStatusTtlSeconds: Long = 3_600,
    val oauthStateTtlSeconds: Long = 600,
    val publicProfileCacheTtlSeconds: Long = 60
)
