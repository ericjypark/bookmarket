package com.bookmarket.api.common

import org.springframework.http.HttpStatus

data class ApiErrorResponse(
    val error: ApiErrorBody
)

data class ApiErrorBody(
    val code: String,
    val message: String,
    val requestId: String,
    val details: Map<String, Any?>? = null
)

class ApiException(
    val status: HttpStatus,
    val code: String,
    override val message: String,
    val details: Map<String, Any?>? = null
) : RuntimeException(message)
