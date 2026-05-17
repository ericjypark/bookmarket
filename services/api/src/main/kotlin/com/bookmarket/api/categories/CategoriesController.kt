package com.bookmarket.api.categories

import com.bookmarket.api.auth.ApiTokenService
import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.common.ApiException
import com.bookmarket.api.operational.PublicProfileCache
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
@RequestMapping("/api/v1/categories")
class CategoriesController(
    private val authService: AuthService,
    private val categoryRepository: CategoryRepository,
    private val publicProfileCache: PublicProfileCache
) {
    @GetMapping
    fun list(request: HttpServletRequest): List<CategoryDto> =
        categoryRepository.findAll(currentUserId(request, ApiTokenService.ScopeBookmarksRead))

    @PostMapping
    fun create(
        request: HttpServletRequest,
        @Valid @RequestBody createRequest: CreateCategoryRequest
    ): CategoryDto {
        val category = categoryRepository.create(currentUserId(request, ApiTokenService.ScopeBookmarksWrite), createRequest.name)
        publicProfileCache.evictAllPublicProfiles()
        return category
    }

    @PatchMapping("/{id}")
    fun update(
        request: HttpServletRequest,
        @PathVariable id: String,
        @Valid @RequestBody updateRequest: UpdateCategoryRequest
    ): CategoryDto {
        val category = categoryRepository.update(currentUserId(request, ApiTokenService.ScopeBookmarksWrite), parseUuid(id, "CATEGORY_ID_INVALID"), updateRequest.name)
        publicProfileCache.evictAllPublicProfiles()
        return category
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(request: HttpServletRequest, @PathVariable id: String) {
        categoryRepository.delete(currentUserId(request, ApiTokenService.ScopeBookmarksWrite), parseUuid(id, "CATEGORY_ID_INVALID"))
        publicProfileCache.evictAllPublicProfiles()
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
