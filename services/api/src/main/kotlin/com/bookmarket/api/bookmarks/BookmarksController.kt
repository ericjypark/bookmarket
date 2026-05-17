package com.bookmarket.api.bookmarks

import com.bookmarket.api.auth.ApiTokenService
import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.common.ApiException
import com.bookmarket.api.operational.IdempotencyService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest
import javax.validation.Valid

@RestController
@RequestMapping("/api/v1/bookmarks")
class BookmarksController(
    private val authService: AuthService,
    private val bookmarkService: BookmarkService,
    private val idempotencyService: IdempotencyService
) {
    @GetMapping
    fun list(
        request: HttpServletRequest,
        @RequestParam(required = false) category: String?
    ): List<BookmarkDto> =
        bookmarkService.list(currentUserId(request, ApiTokenService.ScopeBookmarksRead), category)

    @PostMapping
    fun create(
        request: HttpServletRequest,
        @Valid @RequestBody createRequest: CreateBookmarkRequest
    ): BookmarkDto {
        val userId = currentUserId(request, ApiTokenService.ScopeBookmarksWrite)
        return idempotencyService.execute(request, userId, createRequest, BookmarkDto::class.java) {
            bookmarkService.create(userId, createRequest)
        }
    }

    @GetMapping("/{id}")
    fun get(request: HttpServletRequest, @PathVariable id: String): BookmarkDto =
        bookmarkService.get(currentUserId(request, ApiTokenService.ScopeBookmarksRead), parseUuid(id, "BOOKMARK_ID_INVALID"))

    @PatchMapping("/{id}")
    fun update(
        request: HttpServletRequest,
        @PathVariable id: String,
        @RequestBody updateRequest: UpdateBookmarkRequest
    ): BookmarkDto =
        bookmarkService.update(currentUserId(request, ApiTokenService.ScopeBookmarksWrite), parseUuid(id, "BOOKMARK_ID_INVALID"), updateRequest)

    @PatchMapping("/{id}/category")
    fun updateCategory(
        request: HttpServletRequest,
        @PathVariable id: String,
        @RequestBody updateRequest: UpdateBookmarkCategoryRequest
    ): BookmarkDto =
        bookmarkService.updateCategory(
            currentUserId(request, ApiTokenService.ScopeBookmarksWrite),
            parseUuid(id, "BOOKMARK_ID_INVALID"),
            updateRequest.categoryId?.let { parseUuid(it, "CATEGORY_ID_INVALID") }
        )

    @PostMapping("/{id}/metadata-refetch")
    @ResponseStatus(HttpStatus.ACCEPTED)
    fun refetchMetadata(request: HttpServletRequest, @PathVariable id: String): MetadataJobStatusDto {
        val userId = currentUserId(request, ApiTokenService.ScopeBookmarksWrite)
        val bookmarkId = parseUuid(id, "BOOKMARK_ID_INVALID")
        return idempotencyService.execute(request, userId, mapOf("bookmarkId" to bookmarkId.toString()), MetadataJobStatusDto::class.java) {
            bookmarkService.requestMetadataRefetch(userId, bookmarkId)
        }
    }

    @GetMapping("/{id}/metadata-status")
    fun metadataStatus(request: HttpServletRequest, @PathVariable id: String): MetadataJobStatusDto =
        bookmarkService.metadataStatus(currentUserId(request, ApiTokenService.ScopeBookmarksRead), parseUuid(id, "BOOKMARK_ID_INVALID"))

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(request: HttpServletRequest, @PathVariable id: String) {
        bookmarkService.delete(currentUserId(request, ApiTokenService.ScopeBookmarksWrite), parseUuid(id, "BOOKMARK_ID_INVALID"))
    }

    private fun currentUserId(request: HttpServletRequest, scope: String): UUID =
        UUID.fromString(authService.currentUserOrApiToken(request, setOf(scope)).id)

    private fun parseUuid(value: String, code: String): UUID =
        try {
            UUID.fromString(value)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, code, "Invalid id")
        }
}
