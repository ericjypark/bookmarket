package com.bookmarket.api.marketplace

import com.bookmarket.api.bookmarks.BookmarkDto
import java.time.Instant
import javax.validation.Valid
import javax.validation.constraints.Min
import javax.validation.constraints.NotBlank
import javax.validation.constraints.Size

data class CollectionDto(
    val id: String,
    val title: String,
    val description: String?,
    val visibility: String,
    val items: List<CollectionItemDto>,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class CollectionItemDto(
    val id: String,
    val position: Int,
    val note: String?,
    val bookmark: BookmarkDto
)

data class CollectionItemInput(
    @field:NotBlank
    val bookmarkId: String,
    val note: String? = null
)

data class CreateCollectionRequest(
    @field:NotBlank
    val title: String,
    val description: String? = null,
    val visibility: String = "PRIVATE",
    @field:Valid
    val items: List<CollectionItemInput> = emptyList()
)

data class UpdateCollectionRequest(
    val title: String? = null,
    val description: String? = null,
    val visibility: String? = null,
    @field:Valid
    val items: List<CollectionItemInput>? = null
)

data class ListingDto(
    val id: String,
    val sellerUserId: String,
    val collectionId: String,
    val status: String,
    val slug: String?,
    val title: String,
    val description: String?,
    val priceCents: Int,
    val currency: String,
    val latestVersion: Int?,
    val publishedAt: Instant?,
    val createdAt: Instant,
    val updatedAt: Instant
)

data class ListingVersionDto(
    val id: String,
    val listingId: String,
    val version: Int,
    val collectionId: String,
    val snapshot: Map<String, Any?>,
    val priceCents: Int,
    val currency: String,
    val createdAt: Instant
)

data class CreateListingRequest(
    @field:NotBlank
    val collectionId: String,
    @field:NotBlank
    val title: String,
    val description: String? = null,
    @field:Min(0)
    val priceCents: Int = 0,
    @field:Size(min = 3, max = 3)
    val currency: String = "USD",
    val slug: String? = null
)

data class PurchaseDto(
    val id: String,
    val buyerUserId: String,
    val listingId: String,
    val listingVersionId: String,
    val status: String,
    val amountCents: Int,
    val currency: String,
    val purchasedAt: Instant?,
    val createdAt: Instant
)

data class AccessGrantDto(
    val id: String,
    val userId: String,
    val listingVersionId: String,
    val purchaseId: String?,
    val source: String,
    val expiresAt: Instant?,
    val revokedAt: Instant?,
    val createdAt: Instant
)
