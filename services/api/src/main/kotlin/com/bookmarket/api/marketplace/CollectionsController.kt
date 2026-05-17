package com.bookmarket.api.marketplace

import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest
import javax.validation.Valid

@RestController
@RequestMapping("/api/v1/collections")
class CollectionsController(
    private val authService: AuthService,
    private val marketplaceRepository: MarketplaceRepository
) {
    @GetMapping
    fun list(request: HttpServletRequest): List<CollectionDto> =
        marketplaceRepository.listCollections(currentUserId(request))

    @PostMapping
    fun create(
        request: HttpServletRequest,
        @Valid @RequestBody createRequest: CreateCollectionRequest
    ): CollectionDto =
        marketplaceRepository.createCollection(currentUserId(request), createRequest)

    @GetMapping("/{id}")
    fun get(request: HttpServletRequest, @PathVariable id: String): CollectionDto =
        marketplaceRepository.getOwnedCollection(currentUserId(request), parseUuid(id, "COLLECTION_ID_INVALID"))

    @PatchMapping("/{id}")
    fun update(
        request: HttpServletRequest,
        @PathVariable id: String,
        @Valid @RequestBody updateRequest: UpdateCollectionRequest
    ): CollectionDto =
        marketplaceRepository.updateCollection(currentUserId(request), parseUuid(id, "COLLECTION_ID_INVALID"), updateRequest)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(request: HttpServletRequest, @PathVariable id: String) {
        marketplaceRepository.deleteCollection(currentUserId(request), parseUuid(id, "COLLECTION_ID_INVALID"))
    }

    private fun currentUserId(request: HttpServletRequest): UUID =
        UUID.fromString(authService.currentUser(request).id)

    private fun parseUuid(value: String, code: String): UUID =
        try {
            UUID.fromString(value)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, code, "Invalid id")
        }
}
