package com.bookmarket.api.auth

import com.bookmarket.api.common.ApiException
import com.fasterxml.jackson.annotation.JsonProperty
import org.springframework.boot.web.client.RestTemplateBuilder
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.util.LinkedMultiValueMap
import org.springframework.web.client.RestClientException
import org.springframework.web.client.RestTemplate
import org.springframework.web.util.UriComponentsBuilder
import java.time.Duration

interface OAuthProviderClient {
    fun verifyGoogle(request: OAuthLoginRequest): VerifiedOAuthIdentity
    fun verifyGithub(request: OAuthLoginRequest): VerifiedOAuthIdentity
}

@Component
class HttpOAuthProviderClient(
    restTemplateBuilder: RestTemplateBuilder,
    private val authProperties: AuthProperties
) : OAuthProviderClient {
    private val restTemplate: RestTemplate = restTemplateBuilder
        .setConnectTimeout(Duration.ofSeconds(5))
        .setReadTimeout(Duration.ofSeconds(8))
        .build()

    override fun verifyGoogle(request: OAuthLoginRequest): VerifiedOAuthIdentity {
        val token = request.accessToken?.takeIf { it.isNotBlank() }
            ?: request.credential?.takeIf { it.isNotBlank() }
            ?: request.code?.takeIf { it.isNotBlank() }?.let {
                exchangeGoogleCode(it, request.redirectUri)
            }
            ?: throw ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "OAuth proof is required")

        return if (token.count { it == '.' } == 2) {
            verifyGoogleIdToken(token)
        } else {
            verifyGoogleAccessToken(token)
        }
    }

    override fun verifyGithub(request: OAuthLoginRequest): VerifiedOAuthIdentity {
        val accessToken = request.accessToken?.takeIf { it.isNotBlank() }
            ?: request.credential?.takeIf { it.isNotBlank() }
            ?: request.code?.takeIf { it.isNotBlank() }?.let { exchangeGithubCode(it, request.redirectUri) }
            ?: throw ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "OAuth proof is required")

        val user = githubGet<GithubUser>("https://api.github.com/user", accessToken)
        val emails = githubGet<Array<GithubEmail>>("https://api.github.com/user/emails", accessToken).toList()
        val verifiedEmail = emails.firstOrNull { it.primary && it.verified }
            ?: emails.firstOrNull { it.verified }
            ?: user.email?.takeIf { it.isNotBlank() }?.let { GithubEmail(it, verified = true, primary = true) }
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub email is not verified")

        return VerifiedOAuthIdentity(
            provider = "github",
            subject = user.id.toString(),
            email = verifiedEmail.email,
            emailVerified = verifiedEmail.verified,
            firstName = user.name,
            lastName = null,
            pictureUrl = user.avatarUrl
        )
    }

    private fun verifyGoogleAccessToken(accessToken: String): VerifiedOAuthIdentity {
        val headers = HttpHeaders().apply {
            set(HttpHeaders.AUTHORIZATION, "Bearer $accessToken")
            accept = listOf(MediaType.APPLICATION_JSON)
        }
        val userInfo = providerCall {
            restTemplate.exchange(
                "https://openidconnect.googleapis.com/v1/userinfo",
                HttpMethod.GET,
                HttpEntity<Unit>(headers),
                GoogleUserInfo::class.java
            ).body
        } ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google OAuth proof is invalid")

        if (!userInfo.emailVerified) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google email is not verified")
        }
        return userInfo.toIdentity()
    }

    private fun verifyGoogleIdToken(idToken: String): VerifiedOAuthIdentity {
        val uri = UriComponentsBuilder
            .fromHttpUrl("https://oauth2.googleapis.com/tokeninfo")
            .queryParam("id_token", idToken)
            .build(true)
            .toUri()
        val tokenInfo = providerCall {
            restTemplate.getForObject(uri, GoogleTokenInfo::class.java)
        } ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google OAuth proof is invalid")

        val expectedAudience = authProperties.googleClientId?.takeIf { it.isNotBlank() }
        if (expectedAudience != null && tokenInfo.audience != expectedAudience) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google OAuth audience is invalid")
        }
        if (!tokenInfo.emailVerified) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google email is not verified")
        }
        return tokenInfo.toIdentity()
    }

    private fun exchangeGoogleCode(code: String, redirectUri: String?): String {
        val clientId = requiredSecret(authProperties.googleClientId, "Google client id")
        val clientSecret = requiredSecret(authProperties.googleClientSecret, "Google client secret")
        val resolvedRedirectUri = redirectUri?.takeIf { it.isNotBlank() }
            ?: throw ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", "Google redirectUri is required")
        val form = LinkedMultiValueMap<String, String>().apply {
            add("code", code)
            add("client_id", clientId)
            add("client_secret", clientSecret)
            add("redirect_uri", resolvedRedirectUri)
            add("grant_type", "authorization_code")
        }
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            accept = listOf(MediaType.APPLICATION_JSON)
        }
        val response = providerCall {
            restTemplate.postForObject("https://oauth2.googleapis.com/token", HttpEntity(form, headers), OAuthTokenResponse::class.java)
        } ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google code is invalid")
        return response.idToken ?: response.accessToken
            ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google token response is invalid")
    }

    private fun exchangeGithubCode(code: String, redirectUri: String?): String {
        val clientId = requiredSecret(authProperties.githubClientId, "GitHub client id")
        val clientSecret = requiredSecret(authProperties.githubClientSecret, "GitHub client secret")
        val form = LinkedMultiValueMap<String, String>().apply {
            add("code", code)
            add("client_id", clientId)
            add("client_secret", clientSecret)
            redirectUri?.takeIf { it.isNotBlank() }?.let { add("redirect_uri", it) }
        }
        val headers = HttpHeaders().apply {
            contentType = MediaType.APPLICATION_FORM_URLENCODED
            accept = listOf(MediaType.APPLICATION_JSON)
        }
        val response = providerCall {
            restTemplate.postForObject("https://github.com/login/oauth/access_token", HttpEntity(form, headers), OAuthTokenResponse::class.java)
        } ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub code is invalid")
        if (!response.error.isNullOrBlank()) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub code is invalid")
        }
        return response.accessToken ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub token response is invalid")
    }

    private inline fun <reified T> githubGet(url: String, accessToken: String): T {
        val headers = HttpHeaders().apply {
            set(HttpHeaders.AUTHORIZATION, "Bearer $accessToken")
            accept = listOf(MediaType.valueOf("application/vnd.github+json"))
            set("X-GitHub-Api-Version", "2022-11-28")
        }
        return providerCall {
            restTemplate.exchange(url, HttpMethod.GET, HttpEntity<Unit>(headers), T::class.java).body
        } ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub OAuth proof is invalid")
    }

    private fun requiredSecret(value: String?, name: String): String =
        value?.takeIf { it.isNotBlank() }
            ?: throw ApiException(HttpStatus.SERVICE_UNAVAILABLE, "DEPENDENCY_UNAVAILABLE", "$name is not configured")

    private fun <T> providerCall(call: () -> T): T =
        try {
            call()
        } catch (exception: RestClientException) {
            throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "OAuth provider verification failed")
        }

    private data class OAuthTokenResponse(
        @JsonProperty("access_token")
        val accessToken: String? = null,
        @JsonProperty("id_token")
        val idToken: String? = null,
        val error: String? = null
    )

    private data class GoogleUserInfo(
        val sub: String = "",
        val email: String = "",
        @JsonProperty("email_verified")
        val emailVerified: Boolean = false,
        @JsonProperty("given_name")
        val givenName: String? = null,
        @JsonProperty("family_name")
        val familyName: String? = null,
        val name: String? = null,
        val picture: String? = null
    ) {
        fun toIdentity(): VerifiedOAuthIdentity =
            VerifiedOAuthIdentity(
                provider = "google",
                subject = sub,
                email = email,
                emailVerified = emailVerified,
                firstName = givenName ?: name,
                lastName = familyName,
                pictureUrl = picture
            )
    }

    private data class GoogleTokenInfo(
        val sub: String = "",
        val email: String = "",
        @JsonProperty("email_verified")
        val emailVerifiedRaw: String = "false",
        @JsonProperty("given_name")
        val givenName: String? = null,
        @JsonProperty("family_name")
        val familyName: String? = null,
        val name: String? = null,
        val picture: String? = null,
        @JsonProperty("aud")
        val audience: String? = null
    ) {
        val emailVerified: Boolean
            get() = emailVerifiedRaw.equals("true", ignoreCase = true)

        fun toIdentity(): VerifiedOAuthIdentity =
            VerifiedOAuthIdentity(
                provider = "google",
                subject = sub,
                email = email,
                emailVerified = emailVerified,
                firstName = givenName ?: name,
                lastName = familyName,
                pictureUrl = picture
            )
    }

    private data class GithubUser(
        val id: Long = 0,
        val email: String? = null,
        @JsonProperty("avatar_url")
        val avatarUrl: String? = null,
        val name: String? = null
    )

    private data class GithubEmail(
        val email: String = "",
        val verified: Boolean = false,
        val primary: Boolean = false
    )
}
