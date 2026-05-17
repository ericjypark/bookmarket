package com.bookmarket.api.marketplace

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
@RequestMapping("/api/v1/public-collections")
class PublicCollectionsController(
    private val marketplaceRepository: MarketplaceRepository
) {
    @GetMapping("/{id}")
    fun get(@PathVariable id: String): CollectionDto =
        marketplaceRepository.getPublicCollection(parseUuid(id, "COLLECTION_ID_INVALID"))

    private fun parseUuid(value: String, code: String): UUID =
        try {
            UUID.fromString(value)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, code, "Invalid id")
        }
}
