package com.bookmarket.api.auth

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Component

@Component
class PasswordHasher {
    private val encoder = BCryptPasswordEncoder(12)

    fun hash(password: String): String = encoder.encode(password)

    fun matches(rawPassword: String, passwordHash: String): Boolean =
        encoder.matches(rawPassword, passwordHash)
}
