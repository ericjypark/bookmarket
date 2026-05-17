package com.bookmarket.api.common

import org.springframework.dao.DataIntegrityViolationException
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.slf4j.LoggerFactory
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import java.util.UUID
import javax.servlet.http.HttpServletRequest

@RestControllerAdvice
class ApiExceptionHandler {
    private val logger = LoggerFactory.getLogger(ApiExceptionHandler::class.java)

    @ExceptionHandler(ApiException::class)
    fun handleApiException(exception: ApiException, request: HttpServletRequest): ResponseEntity<ApiErrorResponse> =
        error(exception.status, exception.code, exception.message, request, exception.details)

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidation(exception: MethodArgumentNotValidException, request: HttpServletRequest): ResponseEntity<ApiErrorResponse> {
        val fields = exception.bindingResult.fieldErrors.associate { it.field to (it.defaultMessage ?: "Invalid value") }
        return error(
            HttpStatus.BAD_REQUEST,
            "VALIDATION_FAILED",
            "Validation failed",
            request,
            mapOf("fields" to fields)
        )
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrity(exception: DataIntegrityViolationException, request: HttpServletRequest): ResponseEntity<ApiErrorResponse> =
        error(HttpStatus.CONFLICT, "STATE_CONFLICT", "Request conflicts with existing state", request)

    @ExceptionHandler(Exception::class)
    fun handleUnexpected(exception: Exception, request: HttpServletRequest): ResponseEntity<ApiErrorResponse> {
        logger.error("Unhandled API exception", exception)
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "Unexpected server error", request)
    }

    private fun error(
        status: HttpStatus,
        code: String,
        message: String,
        request: HttpServletRequest,
        details: Map<String, Any?>? = null
    ): ResponseEntity<ApiErrorResponse> {
        val requestId = request.getHeader("X-Request-Id") ?: "req_${UUID.randomUUID()}"
        return ResponseEntity
            .status(status)
            .body(ApiErrorResponse(ApiErrorBody(code = code, message = message, requestId = requestId, details = details)))
    }
}
