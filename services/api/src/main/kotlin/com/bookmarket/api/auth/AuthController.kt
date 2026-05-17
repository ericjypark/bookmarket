package com.bookmarket.api.auth

import com.bookmarket.api.operational.RateLimitService
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.ResponseStatus
import org.springframework.web.bind.annotation.RestController
import javax.servlet.http.HttpServletRequest
import javax.validation.Valid

@RestController
@RequestMapping("/api/v1")
class AuthController(
    private val authService: AuthService,
    private val rateLimitService: RateLimitService
) {
    @PostMapping("/auth/signup")
    fun signup(@Valid @RequestBody request: EmailPasswordRequest, servletRequest: HttpServletRequest): TokenPairDto {
        rateLimitService.requireAuthAttempt("signup", servletRequest, request.email)
        return authService.signup(request)
    }

    @PostMapping("/auth/login")
    fun login(@Valid @RequestBody request: EmailPasswordRequest, servletRequest: HttpServletRequest): TokenPairDto {
        rateLimitService.requireAuthAttempt("login", servletRequest, request.email)
        return authService.login(request)
    }

    @PostMapping("/auth/oauth/google")
    fun googleOAuth(@RequestBody request: OAuthLoginRequest, servletRequest: HttpServletRequest): TokenPairDto {
        rateLimitService.requireAuthAttempt("oauth-google", servletRequest, null)
        return authService.googleOAuth(request)
    }

    @PostMapping("/auth/oauth/github")
    fun githubOAuth(@RequestBody request: OAuthLoginRequest, servletRequest: HttpServletRequest): TokenPairDto {
        rateLimitService.requireAuthAttempt("oauth-github", servletRequest, null)
        return authService.githubOAuth(request)
    }

    @PostMapping("/auth/oauth/state")
    fun oauthState(@Valid @RequestBody request: OAuthStateRequest, servletRequest: HttpServletRequest): OAuthStateDto {
        rateLimitService.requireAuthAttempt("oauth-state-${request.provider.lowercase()}", servletRequest, null)
        return authService.createOAuthState(request)
    }

    @PostMapping("/auth/refresh")
    fun refresh(
        @RequestBody(required = false) request: RefreshTokenRequest?,
        servletRequest: HttpServletRequest
    ): TokenPairDto {
        rateLimitService.requireAuthAttempt("refresh", servletRequest, null)
        return authService.refresh(request?.refreshToken ?: servletRequest.cookies?.firstOrNull { it.name == "refresh_token" }?.value)
    }

    @PostMapping("/auth/logout")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun logout(
        @RequestBody(required = false) request: RefreshTokenRequest?,
        servletRequest: HttpServletRequest
    ) {
        authService.logout(request?.refreshToken ?: servletRequest.cookies?.firstOrNull { it.name == "refresh_token" }?.value)
    }

    @GetMapping("/signup-slots")
    fun signupSlots(): SignupSlotsDto =
        authService.getSignupSlots()
}
