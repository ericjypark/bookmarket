package com.bookmarket.api.auth

import com.bookmarket.api.users.UserProfileDto
import java.time.Instant
import java.util.UUID
import javax.validation.constraints.Email
import javax.validation.constraints.NotBlank
import javax.validation.constraints.Size

data class EmailPasswordRequest(
    @field:Email
    @field:NotBlank
    val email: String,

    @field:NotBlank
    @field:Size(min = 8)
    val password: String
)

data class RefreshTokenRequest(
    val refreshToken: String? = null
)

data class OAuthLoginRequest(
    val code: String? = null,
    val redirectUri: String? = null,
    val credential: String? = null,
    val accessToken: String? = null,
    val state: String? = null
)

data class OAuthStateRequest(
    @field:NotBlank
    val provider: String,

    val pkceVerifier: String? = null
)

data class OAuthStateDto(
    val state: String
)

data class TokenPairDto(
    val accessToken: String,
    val refreshToken: String
)

data class SignupSlotsDto(
    val remaining: Int,
    val total: Int = 100,
    val canSignUp: Boolean
)

data class UserAuthRecord(
    val profile: UserProfileDto,
    val passwordHash: String?
)

data class RefreshTokenRecord(
    val id: UUID,
    val userId: UUID,
    val familyId: UUID,
    val expiresAt: Instant,
    val revokedAt: Instant?,
    val profile: UserProfileDto
)

data class VerifiedOAuthIdentity(
    val provider: String,
    val subject: String,
    val email: String,
    val emailVerified: Boolean,
    val firstName: String?,
    val lastName: String?,
    val pictureUrl: String?
)
