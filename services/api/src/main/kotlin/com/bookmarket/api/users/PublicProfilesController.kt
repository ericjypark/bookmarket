package com.bookmarket.api.users

import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.categories.CategoryDto
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/v1/public-profiles")
class PublicProfilesController(
    private val publicProfileReadService: PublicProfileReadService
) {
    @GetMapping("/{username}")
    fun get(@PathVariable username: String): PublicProfileDto =
        publicProfileReadService.profile(username)

    @GetMapping("/{username}/bookmarks")
    fun bookmarks(
        @PathVariable username: String,
        @RequestParam(required = false) category: String?
    ): List<BookmarkDto> =
        publicProfileReadService.bookmarks(username, category)

    @GetMapping("/{username}/categories")
    fun categories(@PathVariable username: String): List<CategoryDto> =
        publicProfileReadService.categories(username)
}
