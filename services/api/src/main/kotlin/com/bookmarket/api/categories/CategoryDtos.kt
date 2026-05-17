package com.bookmarket.api.categories

import java.time.Instant
import javax.validation.constraints.NotBlank

data class CategoryDto(
    val id: String,
    val name: String,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class CreateCategoryRequest(
    @field:NotBlank
    val name: String
)

data class UpdateCategoryRequest(
    @field:NotBlank
    val name: String
)
