package com.bookmarket.api.marketplace

import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest
import javax.validation.Valid

@RestController
@RequestMapping("/api/v1/marketplace/listings")
class MarketplaceController(
    private val authService: AuthService,
    private val marketplaceRepository: MarketplaceRepository
) {
    @GetMapping
    fun listPublished(): List<ListingDto> =
        marketplaceRepository.listPublishedListings()

    @PostMapping
    fun createDraft(
        request: HttpServletRequest,
        @Valid @RequestBody createRequest: CreateListingRequest
    ): ListingDto =
        marketplaceRepository.createListing(currentUserId(request), createRequest)

    @PostMapping("/{id}/publish")
    fun publish(request: HttpServletRequest, @PathVariable id: String): ListingVersionDto =
        marketplaceRepository.publishListing(currentUserId(request), parseUuid(id, "LISTING_ID_INVALID"))

    @GetMapping("/{slugOrId}")
    fun getPublished(@PathVariable slugOrId: String): ListingDto =
        marketplaceRepository.getPublishedListing(slugOrId)

    @GetMapping("/{slugOrId}/latest-version")
    fun latestVersion(@PathVariable slugOrId: String): ListingVersionDto =
        marketplaceRepository.getLatestVersionForPublishedListing(slugOrId)

    @PostMapping("/{id}/purchases")
    fun purchaseFreeListing(request: HttpServletRequest, @PathVariable id: String): PurchaseDto =
        marketplaceRepository.createFreePurchase(currentUserId(request), parseUuid(id, "LISTING_ID_INVALID"))

    private fun currentUserId(request: HttpServletRequest): UUID =
        UUID.fromString(authService.currentUser(request).id)

    private fun parseUuid(value: String, code: String): UUID =
        try {
            UUID.fromString(value)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, code, "Invalid id")
        }
}
