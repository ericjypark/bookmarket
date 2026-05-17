package com.bookmarket.api.bookmarks

import com.bookmarket.api.categories.CategoryDto
import java.time.Instant
import javax.validation.constraints.NotBlank

data class BookmarkDto(
    val id: String,
    val url: String,
    val title: String?,
    val description: String?,
    val faviconUrl: String?,
    val metadataStatus: String,
    val metadataUpdatedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant,
    val category: CategoryDto?
)

data class CreateBookmarkRequest(
    @field:NotBlank
    val url: String,
    val categoryName: String? = null
)

data class UpdateBookmarkRequest(
    val title: String? = null,
    val categoryName: String? = null
)

data class UpdateBookmarkCategoryRequest(
    val categoryId: String? = null
)

data class MetadataJobStatusDto(
    val bookmarkId: String,
    val metadataStatus: String,
    val metadataVersion: Int
)

data class NormalizedBookmarkUrl(
    val originalUrl: String,
    val normalizedUrl: String
)
