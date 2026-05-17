package com.bookmarket.api.auth

import java.time.Instant
import javax.validation.constraints.NotBlank

data class ApiTokenDto(
    val id: String,
    val name: String,
    val tokenPrefix: String,
    val scopes: List<String>,
    val createdAt: Instant,
    val lastUsedAt: Instant?
)

data class CreateApiTokenRequest(
    @field:NotBlank
    val name: String,
    val scopes: List<String>
)

data class CreateApiTokenResponse(
    val token: String,
    val tokenMetadata: ApiTokenDto
)

data class ApiTokenAuthRecord(
    val userId: String,
    val scopes: List<String>
)
