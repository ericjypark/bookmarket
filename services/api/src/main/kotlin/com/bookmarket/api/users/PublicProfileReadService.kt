package com.bookmarket.api.users

import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.bookmarks.BookmarkRepository
import com.bookmarket.api.categories.CategoryDto
import com.bookmarket.api.categories.CategoryRepository
import com.bookmarket.api.operational.PublicProfileCache
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class PublicProfileReadService(
    private val userRepository: UserRepository,
    private val bookmarkRepository: BookmarkRepository,
    private val categoryRepository: CategoryRepository,
    private val cache: PublicProfileCache
) {
    fun profile(username: String): PublicProfileDto =
        cache.getOrPut(profileKey(username), PublicProfileDto::class.java) {
            userRepository.findPublicProfileByUsername(username)
        }

    fun bookmarks(username: String, category: String?): List<BookmarkDto> =
        cache.getOrPutList(bookmarksKey(username, category), BookmarkDto::class.java) {
            val profile = userRepository.findPublicProfileByUsername(username)
            bookmarkRepository.findPublic(UUID.fromString(profile.id), category)
        }

    fun categories(username: String): List<CategoryDto> =
        cache.getOrPutList(categoriesKey(username), CategoryDto::class.java) {
            val profile = userRepository.findPublicProfileByUsername(username)
            categoryRepository.findPublicCategories(UUID.fromString(profile.id))
        }

    private fun profileKey(username: String): String =
        "public-profile:${username.lowercase()}:profile"

    private fun bookmarksKey(username: String, category: String?): String =
        "public-profile:${username.lowercase()}:bookmarks:${category?.lowercase().orEmpty()}"

    private fun categoriesKey(username: String): String =
        "public-profile:${username.lowercase()}:categories"
}
