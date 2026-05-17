package com.bookmarket.api.users

import com.bookmarket.api.auth.ApiTokenService
import com.bookmarket.api.auth.AuthService
import com.bookmarket.api.common.ApiException
import com.bookmarket.api.operational.PublicProfileCache
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest
import javax.validation.Valid

@RestController
@RequestMapping("/api/v1/users")
class UsersController(
    private val authService: AuthService,
    private val userRepository: UserRepository,
    private val publicProfileCache: PublicProfileCache
) {
    private val reservedUsernames = setOf("www", "api", "s")

    @GetMapping("/me")
    fun me(request: HttpServletRequest): UserProfileDto =
        authService.currentUserOrApiToken(request, setOf(ApiTokenService.ScopeProfileRead))

    @PatchMapping("/me")
    fun updateMe(
        request: HttpServletRequest,
        @Valid @RequestBody updateRequest: UpdateUserProfileRequest
    ): UserProfileDto {
        val currentUser = authService.currentUser(request)
        val username = updateRequest.username
        if (username != null) {
            ensureUsernameAllowed(username)
            if (!userRepository.isUsernameAvailableForUser(UUID.fromString(currentUser.id), username)) {
                throw ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "Username already taken")
            }
        }
        val updated = try {
            userRepository.updateUser(UUID.fromString(currentUser.id), updateRequest)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.NOT_FOUND, "USER_NOT_FOUND", "User not found")
        }
        publicProfileCache.evictAllPublicProfiles()
        return updated
    }

    @GetMapping("/check-username")
    fun checkUsername(
        request: HttpServletRequest,
        @RequestParam username: String
    ): UsernameAvailabilityDto {
        val currentUser = authService.currentUserOrApiToken(request, setOf(ApiTokenService.ScopeProfileRead))
        ensureUsernameAllowed(username)
        return UsernameAvailabilityDto(
            isAvailable = userRepository.isUsernameAvailableForUser(UUID.fromString(currentUser.id), username)
        )
    }

    private fun ensureUsernameAllowed(username: String) {
        if (reservedUsernames.contains(username.lowercase())) {
            throw ApiException(HttpStatus.FORBIDDEN, "USERNAME_NOT_ALLOWED", "This username is not allowed")
        }
    }
}
