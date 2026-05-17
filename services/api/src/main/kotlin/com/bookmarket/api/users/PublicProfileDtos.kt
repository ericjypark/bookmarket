package com.bookmarket.api.users

data class PublicProfileDto(
    val id: String,
    val username: String,
    val firstName: String?,
    val lastName: String?,
    val pictureUrl: String?,
    val isPublic: Boolean
)
