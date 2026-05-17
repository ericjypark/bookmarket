package com.bookmarket.api.users

import javax.validation.constraints.Pattern
import javax.validation.constraints.Size

data class UserProfileDto(
    val id: String,
    val email: String,
    val username: String?,
    val firstName: String?,
    val lastName: String?,
    val pictureUrl: String?,
    val isPublic: Boolean
)

data class UpdateUserProfileRequest(
    @field:Pattern(regexp = "^[a-z]+$", message = "Username must contain only lowercase characters")
    @field:Size(max = 12, message = "Username cannot exceed 12 characters")
    val username: String? = null,

    @field:Size(max = 50, message = "First name cannot exceed 50 characters")
    val firstName: String? = null,

    @field:Size(max = 50, message = "Last name cannot exceed 50 characters")
    val lastName: String? = null,

    val isPublic: Boolean? = null
)

data class UsernameAvailabilityDto(
    val isAvailable: Boolean
)
