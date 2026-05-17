package com.bookmarket.api.bookmarks

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Component
import java.net.URI

@Component
class BookmarkUrlNormalizer {
    fun normalize(rawUrl: String): NormalizedBookmarkUrl {
        val trimmed = rawUrl.trim()
        if (trimmed.isBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "BOOKMARK_URL_REQUIRED", "URL is required")
        }

        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        val uri = try {
            URI(withScheme)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, "BOOKMARK_URL_INVALID", "Invalid URL")
        }

        val scheme = uri.scheme?.lowercase()
        val host = uri.host?.lowercase()
        if (scheme !in setOf("http", "https") || host.isNullOrBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "BOOKMARK_URL_INVALID", "Invalid URL")
        }

        val port = if (uri.port == -1) "" else ":${uri.port}"
        val path = uri.rawPath?.takeIf { it.isNotBlank() } ?: ""
        val query = uri.rawQuery?.let { "?$it" } ?: ""
        return NormalizedBookmarkUrl(
            originalUrl = withScheme,
            normalizedUrl = "$scheme://$host$port$path$query"
        )
    }
}
