package com.bookmarket.api

import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class HealthController {
    @GetMapping("/health")
    fun health(): HealthResponse = HealthResponse(status = "UP", service = "api")
}

data class HealthResponse(
    val status: String,
    val service: String
)
