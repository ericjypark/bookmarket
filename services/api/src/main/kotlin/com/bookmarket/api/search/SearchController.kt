package com.bookmarket.api.search

import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.auth.ApiTokenService
import com.bookmarket.api.bookmarks.BookmarkDto
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest

@RestController
@RequestMapping("/api/v1/search")
class SearchController(
    private val authService: AuthService,
    private val searchService: SearchService
) {
    @GetMapping("/bookmarks")
    fun searchBookmarks(
        request: HttpServletRequest,
        @RequestParam q: String
    ): List<BookmarkDto> =
        searchService.searchBookmarks(
            UUID.fromString(authService.currentUserOrApiToken(request, setOf(ApiTokenService.ScopeBookmarksRead)).id),
            q
        )
}
