package com.bookmarket.api.search

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

@RestController
@RequestMapping("/api/v1/ops/search/bookmarks")
class SearchMaintenanceController(
    private val searchProperties: SearchProperties,
    private val searchService: SearchService
) {
    @PostMapping("/rebuild")
    fun rebuildBookmarks(
        @RequestHeader("X-Bookmarket-Ops-Token", required = false) opsToken: String?
    ): SearchService.SearchRebuildResult {
        val expectedToken = searchProperties.rebuildToken.trim()
        if (expectedToken.isBlank()) {
            throw ApiException(HttpStatus.NOT_FOUND, "NOT_FOUND", "Search rebuild operation is not enabled")
        }
        if (!opsToken.matchesToken(expectedToken)) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Operations token is required")
        }
        return searchService.rebuildBookmarkIndex()
    }

    private fun String?.matchesToken(expectedToken: String): Boolean {
        if (isNullOrBlank()) {
            return false
        }
        return MessageDigest.isEqual(
            expectedToken.toByteArray(StandardCharsets.UTF_8),
            toByteArray(StandardCharsets.UTF_8)
        )
    }
}
