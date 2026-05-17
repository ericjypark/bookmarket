package com.bookmarket.api.marketplace

import com.bookmarket.api.auth.AuthService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID
import javax.servlet.http.HttpServletRequest

@RestController
@RequestMapping("/api/v1")
class PurchasesController(
    private val authService: AuthService,
    private val marketplaceRepository: MarketplaceRepository
) {
    @GetMapping("/purchases")
    fun purchases(request: HttpServletRequest): List<PurchaseDto> =
        marketplaceRepository.listPurchases(currentUserId(request))

    @GetMapping("/access-grants")
    fun accessGrants(request: HttpServletRequest): List<AccessGrantDto> =
        marketplaceRepository.listAccessGrants(currentUserId(request))

    private fun currentUserId(request: HttpServletRequest): UUID =
        UUID.fromString(authService.currentUser(request).id)
}
