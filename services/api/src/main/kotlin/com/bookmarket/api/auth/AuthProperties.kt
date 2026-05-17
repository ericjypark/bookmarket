package com.bookmarket.api.auth

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.ConstructorBinding

@ConstructorBinding
@ConfigurationProperties(prefix = "bookmarket.auth")
data class AuthProperties(
    val issuer: String,
    val audience: String,
    val secret: String,
    val accessTokenTtlSeconds: Long,
    val refreshTokenTtlSeconds: Long,
    val googleClientId: String? = null,
    val googleClientSecret: String? = null,
    val githubClientId: String? = null,
    val githubClientSecret: String? = null
)
