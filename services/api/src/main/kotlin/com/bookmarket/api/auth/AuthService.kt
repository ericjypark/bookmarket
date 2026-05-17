package com.bookmarket.api.auth

import com.bookmarket.api.common.ApiException
import com.bookmarket.api.operational.OAuthStateService
import com.bookmarket.api.users.UserProfileDto
import com.bookmarket.api.users.UserRepository
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.time.Clock
import java.util.UUID
import javax.servlet.http.HttpServletRequest

@Service
class AuthService(
    private val userRepository: UserRepository,
    private val passwordHasher: PasswordHasher,
    private val tokenService: TokenService,
    private val apiTokenService: ApiTokenService,
    private val oauthProviderClient: OAuthProviderClient,
    private val oauthStateService: OAuthStateService,
    private val clock: Clock = Clock.systemUTC()
) {
    private val maxSignupSlots = 100
    private val usernameAlphabet = ('a'..'z').toList()

    fun getSignupSlots(): SignupSlotsDto {
        val used = userRepository.countUsers()
        val remaining = (maxSignupSlots - used).coerceAtLeast(0)
        return SignupSlotsDto(remaining = remaining, total = maxSignupSlots, canSignUp = remaining > 0)
    }

    fun signup(request: EmailPasswordRequest): TokenPairDto {
        if (userRepository.findEmailAccount(request.email) != null) {
            throw ApiException(HttpStatus.CONFLICT, "USER_ALREADY_EXISTS", "User already exists")
        }
        if (getSignupSlots().remaining <= 0) {
            throw ApiException(
                HttpStatus.FORBIDDEN,
                "SIGNUP_SLOTS_FULL",
                "No more signup slots available. Maximum of 100 users reached."
            )
        }

        val profile = try {
            userRepository.createEmailUser(
                email = request.email.trim().lowercase(),
                passwordHash = passwordHasher.hash(request.password),
                username = generateUsername(),
                maxUsers = maxSignupSlots
            )
        } catch (exception: Exception) {
            if (userRepository.findEmailAccount(request.email) != null) {
                throw ApiException(HttpStatus.CONFLICT, "USER_ALREADY_EXISTS", "User already exists")
            }
            throw exception
        }

        return createTokenPair(UUID.fromString(profile.id))
    }

    fun login(request: EmailPasswordRequest): TokenPairDto {
        val record = userRepository.findEmailAccount(request.email)
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "User not found")
        val passwordHash = record.passwordHash
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "User not found")
        if (!passwordHasher.matches(request.password, passwordHash)) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Incorrect credentials provided")
        }
        return createTokenPair(UUID.fromString(record.profile.id))
    }

    fun googleOAuth(request: OAuthLoginRequest): TokenPairDto {
        request.state?.takeIf { it.isNotBlank() }?.let { oauthStateService.consume("google", it) }
        return oauthTokenPair(oauthProviderClient.verifyGoogle(request))
    }

    fun githubOAuth(request: OAuthLoginRequest): TokenPairDto {
        request.state?.takeIf { it.isNotBlank() }?.let { oauthStateService.consume("github", it) }
        return oauthTokenPair(oauthProviderClient.verifyGithub(request))
    }

    fun createOAuthState(request: OAuthStateRequest): OAuthStateDto {
        val provider = request.provider.trim().lowercase()
        if (provider !in setOf("google", "github")) {
            throw ApiException(HttpStatus.BAD_REQUEST, "OAUTH_PROVIDER_INVALID", "Unsupported OAuth provider")
        }
        return OAuthStateDto(oauthStateService.create(provider, request.pkceVerifier?.takeIf { it.isNotBlank() }))
    }

    fun refresh(refreshToken: String?): TokenPairDto {
        if (refreshToken.isNullOrBlank()) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Refresh token is required")
        }
        val record = userRepository.findRefreshToken(tokenService.hashRefreshToken(refreshToken))
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid refresh token")
        if (record.revokedAt != null || record.expiresAt <= clock.instant()) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Invalid refresh token")
        }

        val accessToken = tokenService.createAccessToken(record.userId)
        val newRefreshToken = tokenService.createRefreshToken()
        userRepository.rotateRefreshToken(
            record = record,
            newHash = tokenService.hashRefreshToken(newRefreshToken),
            newExpiresAt = tokenService.refreshTokenExpiresAt()
        )
        return TokenPairDto(accessToken = accessToken, refreshToken = newRefreshToken)
    }

    fun logout(refreshToken: String?) {
        if (!refreshToken.isNullOrBlank()) {
            userRepository.revokeRefreshToken(tokenService.hashRefreshToken(refreshToken))
        }
    }

    fun currentUser(request: HttpServletRequest): UserProfileDto =
        currentSessionUser(request)

    fun currentUserOrApiToken(request: HttpServletRequest, requiredApiTokenScopes: Set<String>): UserProfileDto {
        val token = bearerToken(request) ?: request.cookies?.firstOrNull { it.name == "access_token" }?.value
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Authentication is required")
        if (apiTokenService.isApiToken(token)) {
            return apiTokenService.authenticate(token, requiredApiTokenScopes)
        }
        return currentUserFromAccessToken(token)
    }

    fun currentSessionUser(request: HttpServletRequest): UserProfileDto {
        val token = bearerToken(request) ?: request.cookies?.firstOrNull { it.name == "access_token" }?.value
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "Authentication is required")
        if (apiTokenService.isApiToken(token)) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_REQUIRED", "A user session is required")
        }
        return currentUserFromAccessToken(token)
    }

    private fun currentUserFromAccessToken(token: String): UserProfileDto {
        val userId = tokenService.verifyAccessToken(token)
        return userRepository.findUserById(userId)
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "User not found")
    }

    private fun createTokenPair(userId: UUID): TokenPairDto {
        val accessToken = tokenService.createAccessToken(userId)
        val refreshToken = tokenService.createRefreshToken()
        userRepository.saveRefreshToken(
            userId = userId,
            tokenHash = tokenService.hashRefreshToken(refreshToken),
            familyId = UUID.randomUUID(),
            expiresAt = tokenService.refreshTokenExpiresAt()
        )
        return TokenPairDto(accessToken = accessToken, refreshToken = refreshToken)
    }

    private fun oauthTokenPair(identity: VerifiedOAuthIdentity): TokenPairDto {
        if (!identity.emailVerified) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "OAuth email is not verified")
        }

        val profile = userRepository.createOrLinkOAuthUser(
            provider = identity.provider,
            providerSubject = identity.subject,
            email = identity.email,
            firstName = identity.firstName,
            lastName = identity.lastName,
            pictureUrl = identity.pictureUrl,
            username = generateUsername(),
            maxUsers = maxSignupSlots
        )
        return createTokenPair(UUID.fromString(profile.id))
    }

    private fun bearerToken(request: HttpServletRequest): String? {
        val header = request.getHeader("Authorization") ?: return null
        val parts = header.split(" ", limit = 2)
        return if (parts.size == 2 && parts[0].equals("Bearer", ignoreCase = true)) parts[1] else null
    }

    private fun generateUsername(): String {
        repeat(20) {
            val username = (1..10).map { usernameAlphabet.random() }.joinToString("")
            if (userRepository.isUsernameAvailable(username)) {
                return username
            }
        }
        return "user${UUID.randomUUID().toString().replace("-", "").take(8)}"
    }
}
