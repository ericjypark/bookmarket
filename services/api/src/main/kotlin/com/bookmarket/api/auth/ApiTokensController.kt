package com.bookmarket.api.auth

import com.bookmarket.api.common.ApiException
import org.springframework.http.HttpStatus
import org.springframework.web.bind.annotation.DeleteMapping
import org.springframework.web.bind.annotation.GetMapping
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
@RequestMapping("/api/v1/api-tokens")
class ApiTokensController(
    private val authService: AuthService,
    private val apiTokenService: ApiTokenService
) {
    @GetMapping
    fun list(request: HttpServletRequest): List<ApiTokenDto> =
        apiTokenService.list(UUID.fromString(authService.currentSessionUser(request).id))

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(
        request: HttpServletRequest,
        @Valid @RequestBody createRequest: CreateApiTokenRequest
    ): CreateApiTokenResponse =
        apiTokenService.create(UUID.fromString(authService.currentSessionUser(request).id), createRequest)

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun delete(request: HttpServletRequest, @PathVariable id: String) {
        apiTokenService.revoke(UUID.fromString(authService.currentSessionUser(request).id), parseUuid(id))
    }

    private fun parseUuid(value: String): UUID =
        try {
            UUID.fromString(value)
        } catch (exception: IllegalArgumentException) {
            throw ApiException(HttpStatus.BAD_REQUEST, "API_TOKEN_ID_INVALID", "Invalid API token id")
        }
}
