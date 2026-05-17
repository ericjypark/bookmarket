package com.bookmarket.api

import com.bookmarket.api.auth.OAuthLoginRequest
import com.bookmarket.api.auth.OAuthProviderClient
import com.bookmarket.api.auth.VerifiedOAuthIdentity
import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.bookmarks.BookmarkRepository
import com.bookmarket.api.common.ApiException
import com.bookmarket.api.events.ProcessedEventRepository
import com.bookmarket.api.operational.MetadataJobStatusCache
import com.bookmarket.api.operational.PublicProfileCache
import com.bookmarket.api.operational.RateLimitService
import com.bookmarket.api.search.BookmarkSearchIndex
import com.bookmarket.api.search.MetadataEventsConsumer
import com.bookmarket.api.search.SearchService
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.context.TestConfiguration
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Import
import org.springframework.context.annotation.Primary
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.test.web.servlet.MockHttpServletRequestDsl
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.delete
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.patch
import org.springframework.test.web.servlet.post
import org.testcontainers.containers.GenericContainer
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import org.testcontainers.utility.DockerImageName
import java.time.Duration
import java.time.Instant
import java.util.UUID

@SpringBootTest
@AutoConfigureMockMvc
@Testcontainers
@Import(OAuthProviderTestConfig::class)
class BookmarkWorkspaceIntegrationTest {
    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var objectMapper: ObjectMapper

    @Autowired
    lateinit var rateLimitService: RateLimitService

    @Autowired
    lateinit var fakeOAuthProviderClient: FakeOAuthProviderClient

    @Autowired
    lateinit var fakeBookmarkSearchIndex: FakeBookmarkSearchIndex

    @Autowired
    lateinit var jdbcTemplate: JdbcTemplate

    @Autowired
    lateinit var bookmarkRepository: BookmarkRepository

    @Autowired
    lateinit var searchService: SearchService

    @Autowired
    lateinit var metadataJobStatusCache: MetadataJobStatusCache

    @Autowired
    lateinit var publicProfileCache: PublicProfileCache

    @Autowired
    lateinit var processedEventRepository: ProcessedEventRepository

    @Test
    fun `bookmark workspace endpoints preserve v1 ordering filtering mutation and public reads`() {
        val auth = signup()
        val firstCategory = createCategory(auth.accessToken, "Docs ${suffix()}")
        val secondCategory = createCategory(auth.accessToken, "Tools ${suffix()}")

        val firstBookmark = createBookmark(auth.accessToken, "example.com/${suffix()}", firstCategory["name"].asText())
        val secondBookmark = createBookmark(auth.accessToken, "https://openai.com/${suffix()}", secondCategory["name"].asText())

        mockMvc.get("/api/v1/bookmarks") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(secondBookmark["id"].asText()) }
            jsonPath("$[0].metadataStatus") { value("PENDING") }
            jsonPath("$[1].id") { value(firstBookmark["id"].asText()) }
        }

        mockMvc.get("/api/v1/bookmarks?category=${firstCategory["name"].asText()}") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(firstBookmark["id"].asText()) }
            jsonPath("$[0].url") { value(firstBookmark["url"].asText()) }
            jsonPath("$[0].category.name") { value(firstCategory["name"].asText()) }
        }

        mockMvc.patch("/api/v1/bookmarks/${firstBookmark["id"].asText()}") {
            bearer(auth.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Renamed docs"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Renamed docs") }
        }

        mockMvc.get("/api/v1/search/bookmarks?q=Renamed") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(firstBookmark["id"].asText()) }
            jsonPath("$[0].title") { value("Renamed docs") }
        }

        mockMvc.get("/api/v1/search/bookmarks?q=openai") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(secondBookmark["id"].asText()) }
        }

        mockMvc.patch("/api/v1/bookmarks/${firstBookmark["id"].asText()}/category") {
            bearer(auth.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"categoryId":null}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.category") { doesNotExist() }
        }

        mockMvc.post("/api/v1/bookmarks/${firstBookmark["id"].asText()}/metadata-refetch") {
            bearer(auth.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.bookmarkId") { value(firstBookmark["id"].asText()) }
            jsonPath("$.metadataStatus") { value("PENDING") }
            jsonPath("$.metadataVersion") { value(2) }
        }

        mockMvc.get("/api/v1/public-profiles/${auth.username}/bookmarks?category=${secondCategory["name"].asText()}") {
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(secondBookmark["id"].asText()) }
            jsonPath("$[0].category.name") { value(secondCategory["name"].asText()) }
        }

        mockMvc.delete("/api/v1/bookmarks/${firstBookmark["id"].asText()}") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isNoContent() }
        }

        mockMvc.get("/api/v1/bookmarks/${firstBookmark["id"].asText()}") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        mockMvc.get("/api/v1/search/bookmarks?q=Renamed") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `users cannot mutate another users categories or bookmarks`() {
        val owner = signup()
        val stranger = signup()
        val ownerCategory = createCategory(owner.accessToken, "Private ${suffix()}")
        val ownerBookmark = createBookmark(owner.accessToken, "https://example.org/${suffix()}", ownerCategory["name"].asText())

        mockMvc.get("/api/v1/bookmarks/${ownerBookmark["id"].asText()}") {
            bearer(stranger.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        mockMvc.patch("/api/v1/bookmarks/${ownerBookmark["id"].asText()}") {
            bearer(stranger.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Stolen title"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        mockMvc.post("/api/v1/bookmarks/${ownerBookmark["id"].asText()}/metadata-refetch") {
            bearer(stranger.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        mockMvc.get("/api/v1/bookmarks/${ownerBookmark["id"].asText()}/metadata-status") {
            bearer(stranger.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        val strangerBookmark = createBookmark(stranger.accessToken, "https://stranger.example/${suffix()}", null)
        mockMvc.patch("/api/v1/bookmarks/${strangerBookmark["id"].asText()}/category") {
            bearer(stranger.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"categoryId":"${ownerCategory["id"].asText()}"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("CATEGORY_NOT_FOUND") }
        }

        mockMvc.patch("/api/v1/categories/${ownerCategory["id"].asText()}") {
            bearer(stranger.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"Renamed private"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("CATEGORY_NOT_FOUND") }
        }

        mockMvc.delete("/api/v1/categories/${ownerCategory["id"].asText()}") {
            bearer(stranger.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("CATEGORY_NOT_FOUND") }
        }

        mockMvc.get("/api/v1/search/bookmarks?q=example.org") {
            bearer(stranger.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(0) }
        }
    }

    @Test
    fun `private endpoint families require auth and session only endpoints reject api tokens`() {
        val auth = signup()
        val apiToken = createApiToken(
            auth.accessToken,
            "Full scope API token",
            listOf("bookmarks:read", "bookmarks:write", "profile:read")
        )["token"].asText()
        val randomId = UUID.randomUUID().toString()

        mockMvc.get("/api/v1/users/me").andExpectAuthRequired()
        mockMvc.patch("/api/v1/users/me") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"firstName":"Unauthed"}"""
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/users/check-username?username=available${suffix()}").andExpectAuthRequired()
        mockMvc.get("/api/v1/bookmarks").andExpectAuthRequired()
        mockMvc.post("/api/v1/bookmarks") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://unauthenticated.example/${suffix()}"}"""
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/bookmarks/$randomId").andExpectAuthRequired()
        mockMvc.patch("/api/v1/bookmarks/$randomId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"No session"}"""
        }.andExpectAuthRequired()
        mockMvc.patch("/api/v1/bookmarks/$randomId/category") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"categoryId":null}"""
        }.andExpectAuthRequired()
        mockMvc.post("/api/v1/bookmarks/$randomId/metadata-refetch") {
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/bookmarks/$randomId/metadata-status").andExpectAuthRequired()
        mockMvc.delete("/api/v1/bookmarks/$randomId").andExpectAuthRequired()
        mockMvc.get("/api/v1/categories").andExpectAuthRequired()
        mockMvc.post("/api/v1/categories") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"No session"}"""
        }.andExpectAuthRequired()
        mockMvc.patch("/api/v1/categories/$randomId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"No session"}"""
        }.andExpectAuthRequired()
        mockMvc.delete("/api/v1/categories/$randomId").andExpectAuthRequired()
        mockMvc.get("/api/v1/search/bookmarks?q=private").andExpectAuthRequired()
        mockMvc.get("/api/v1/api-tokens").andExpectAuthRequired()
        mockMvc.post("/api/v1/api-tokens") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("name" to "No session", "scopes" to listOf("bookmarks:read")))
        }.andExpectAuthRequired()
        mockMvc.delete("/api/v1/api-tokens/$randomId").andExpectAuthRequired()
        mockMvc.get("/api/v1/collections").andExpectAuthRequired()
        mockMvc.post("/api/v1/collections") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("title" to "No session"))
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/collections/$randomId").andExpectAuthRequired()
        mockMvc.patch("/api/v1/collections/$randomId") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"No session"}"""
        }.andExpectAuthRequired()
        mockMvc.delete("/api/v1/collections/$randomId").andExpectAuthRequired()
        mockMvc.post("/api/v1/marketplace/listings") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf("collectionId" to randomId, "title" to "No session", "priceCents" to 0, "currency" to "USD")
            )
        }.andExpectAuthRequired()
        mockMvc.post("/api/v1/marketplace/listings/$randomId/purchases").andExpectAuthRequired()
        mockMvc.get("/api/v1/purchases").andExpectAuthRequired()
        mockMvc.get("/api/v1/access-grants").andExpectAuthRequired()

        mockMvc.patch("/api/v1/users/me") {
            bearer(apiToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"firstName":"API token"}"""
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/api-tokens") { bearer(apiToken) }.andExpectAuthRequired()
        mockMvc.post("/api/v1/api-tokens") {
            bearer(apiToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("name" to "Nested token", "scopes" to listOf("bookmarks:read")))
        }.andExpectAuthRequired()
        mockMvc.delete("/api/v1/api-tokens/$randomId") { bearer(apiToken) }.andExpectAuthRequired()
        mockMvc.get("/api/v1/collections") { bearer(apiToken) }.andExpectAuthRequired()
        mockMvc.post("/api/v1/collections") {
            bearer(apiToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("title" to "API token collection"))
        }.andExpectAuthRequired()
        mockMvc.get("/api/v1/purchases") { bearer(apiToken) }.andExpectAuthRequired()
        mockMvc.get("/api/v1/access-grants") { bearer(apiToken) }.andExpectAuthRequired()
    }

    @Test
    fun `api dto responses do not expose persistence secrets`() {
        val auth = signup()
        val category = createCategory(auth.accessToken, "DTO ${suffix()}")
        createBookmark(auth.accessToken, "https://dto.example/${suffix()}", category["name"].asText())
        val token = createApiToken(auth.accessToken, "DTO token", listOf("bookmarks:read"))
        val collection = mockMvc.post("/api/v1/collections") {
            bearer(auth.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("title" to "DTO Collection ${suffix()}"))
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString.readJson()

        val responseBodies = listOf(
            mockMvc.get("/api/v1/users/me") { bearer(auth.accessToken) }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/bookmarks") { bearer(auth.accessToken) }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/categories") { bearer(auth.accessToken) }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/api-tokens") { bearer(auth.accessToken) }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/collections/${collection["id"].asText()}") { bearer(auth.accessToken) }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/public-profiles/${auth.username}") { }.andExpect { status { isOk() } },
            mockMvc.get("/api/v1/search/bookmarks?q=dto") { bearer(auth.accessToken) }.andExpect { status { isOk() } }
        ).map { it.andReturn().response.contentAsString } + token.toString()

        responseBodies.forEach(::assertNoPersistenceSecrets)
        assertFalse(
            mockMvc.get("/api/v1/api-tokens") {
                bearer(auth.accessToken)
            }.andReturn().response.contentAsString.contains("\"token\""),
            "API token list must not expose one-time plain token values"
        )
    }

    @Test
    fun `api tokens are shown once can search with scope and can be revoked`() {
        val auth = signup()
        val bookmark = createBookmark(auth.accessToken, "https://raycast.example/${suffix()}", null)
        val tokenResponse = createApiToken(auth.accessToken, "Raycast", listOf("bookmarks:read"))
        val apiToken = tokenResponse["token"].asText()
        val tokenId = tokenResponse["tokenMetadata"]["id"].asText()
        val tokenPrefix = tokenResponse["tokenMetadata"]["tokenPrefix"].asText()

        mockMvc.get("/api/v1/api-tokens") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(tokenId) }
            jsonPath("$[0].tokenPrefix") { value(tokenPrefix) }
            jsonPath("$[0].token") { doesNotExist() }
        }

        fakeBookmarkSearchIndex.searchResult = emptyList()
        mockMvc.get("/api/v1/search/bookmarks?q=raycast") {
            bearer(apiToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(bookmark["id"].asText()) }
        }
        fakeBookmarkSearchIndex.searchResult = null

        mockMvc.get("/api/v1/bookmarks") {
            bearer(apiToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].id") { value(bookmark["id"].asText()) }
        }

        mockMvc.post("/api/v1/bookmarks") {
            bearer(apiToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://read-token-cannot-write.example/${suffix()}"}"""
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("API_TOKEN_SCOPE_MISSING") }
        }

        val writeOnlyToken = createApiToken(auth.accessToken, "Bookmark writer", listOf("bookmarks:write"))["token"].asText()
        val writeCategory = mockMvc.post("/api/v1/categories") {
            bearer(writeOnlyToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"API Write ${suffix()}"}"""
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString.readJson()
        val writeBookmark = createBookmark(writeOnlyToken, "https://write-token.example/${suffix()}", writeCategory["name"].asText())

        mockMvc.get("/api/v1/bookmarks") {
            bearer(writeOnlyToken)
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("API_TOKEN_SCOPE_MISSING") }
        }

        mockMvc.patch("/api/v1/bookmarks/${writeBookmark["id"].asText()}") {
            bearer(writeOnlyToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Write token rename"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.title") { value("Write token rename") }
        }

        mockMvc.delete("/api/v1/categories/${writeCategory["id"].asText()}") {
            bearer(apiToken)
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("API_TOKEN_SCOPE_MISSING") }
        }

        mockMvc.get("/api/v1/api-tokens") {
            bearer(apiToken)
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_REQUIRED") }
        }

        val profileOnlyToken = createApiToken(auth.accessToken, "Profile reader", listOf("profile:read"))["token"].asText()
        mockMvc.get("/api/v1/search/bookmarks?q=raycast") {
            bearer(profileOnlyToken)
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("API_TOKEN_SCOPE_MISSING") }
        }

        mockMvc.get("/api/v1/users/me") {
            bearer(profileOnlyToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(auth.userId) }
        }

        mockMvc.get("/api/v1/users/check-username?username=${auth.username}") {
            bearer(profileOnlyToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.isAvailable") { value(true) }
        }

        mockMvc.get("/api/v1/users/check-username?username=Upper") {
            bearer(profileOnlyToken)
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("VALIDATION_FAILED") }
            jsonPath("$.error.details.fields.username") { value("Username must contain only lowercase characters") }
        }

        mockMvc.get("/api/v1/users/check-username?username=www") {
            bearer(profileOnlyToken)
        }.andExpect {
            status { isForbidden() }
            jsonPath("$.error.code") { value("USERNAME_NOT_ALLOWED") }
        }

        mockMvc.patch("/api/v1/users/me") {
            bearer(profileOnlyToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"firstName":"API"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_REQUIRED") }
        }

        mockMvc.delete("/api/v1/api-tokens/$tokenId") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isNoContent() }
        }

        mockMvc.get("/api/v1/search/bookmarks?q=raycast") {
            bearer(apiToken)
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }
    }

    @Test
    fun `refresh tokens rotate and logout revokes the active refresh token`() {
        val auth = signup()

        val refreshed = mockMvc.post("/api/v1/auth/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"${auth.refreshToken}"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.accessToken") { exists() }
            jsonPath("$.refreshToken") { exists() }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.post("/api/v1/auth/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"${auth.refreshToken}"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }

        val activeRefreshToken = refreshed["refreshToken"].asText()
        mockMvc.post("/api/v1/auth/logout") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"$activeRefreshToken"}"""
        }.andExpect {
            status { isNoContent() }
        }

        mockMvc.post("/api/v1/auth/refresh") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"refreshToken":"$activeRefreshToken"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }
    }

    @Test
    fun `refresh tokens are issued with a one month ttl`() {
        val issuedAfter = Instant.now()
        val auth = signup()

        val expiresAt = jdbcTemplate.queryForObject(
            """
            SELECT expires_at
            FROM refresh_tokens
            WHERE user_id = ?::uuid AND revoked_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            """.trimIndent(),
            java.sql.Timestamp::class.java,
            auth.userId
        ).toInstant()

        val ttl = Duration.between(issuedAfter, expiresAt)
        assertTrue(
            ttl >= Duration.ofDays(29) && ttl <= Duration.ofDays(31),
            "Refresh token should live for about one month, got ${ttl.toDays()} days"
        )
    }

    @Test
    fun `hidden marketplace foundations preserve collection privacy snapshots and access grants`() {
        val seller = signup()
        val buyer = signup()
        val bookmark = createBookmark(seller.accessToken, "https://marketplace.example/${suffix()}", null)

        val collection = mockMvc.post("/api/v1/collections") {
            bearer(seller.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "title" to "Launch Stack ${suffix()}",
                    "visibility" to "PRIVATE",
                    "items" to listOf(mapOf("bookmarkId" to bookmark["id"].asText(), "note" to "Original snapshot note"))
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.visibility") { value("PRIVATE") }
            jsonPath("$.items.length()") { value(1) }
            jsonPath("$.items[0].bookmark.id") { value(bookmark["id"].asText()) }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.get("/api/v1/public-collections/${collection["id"].asText()}") {
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("COLLECTION_NOT_FOUND") }
        }

        mockMvc.post("/api/v1/collections") {
            bearer(buyer.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "title" to "Stolen Stack",
                    "items" to listOf(mapOf("bookmarkId" to bookmark["id"].asText()))
                )
            )
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("BOOKMARK_NOT_FOUND") }
        }

        mockMvc.get("/api/v1/collections/${collection["id"].asText()}") {
            bearer(buyer.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("COLLECTION_NOT_FOUND") }
        }

        mockMvc.patch("/api/v1/collections/${collection["id"].asText()}") {
            bearer(buyer.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Wrong owner"}"""
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("COLLECTION_NOT_FOUND") }
        }

        val listing = mockMvc.post("/api/v1/marketplace/listings") {
            bearer(seller.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "collectionId" to collection["id"].asText(),
                    "title" to "Launch Stack Listing",
                    "priceCents" to 0,
                    "currency" to "USD"
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.status") { value("DRAFT") }
            jsonPath("$.latestVersion") { doesNotExist() }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/publish") {
            bearer(buyer.accessToken)
        }.andExpect {
            status { isNotFound() }
            jsonPath("$.error.code") { value("LISTING_NOT_FOUND") }
        }

        mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/publish") {
            bearer(seller.accessToken)
        }.andExpect {
            status { isConflict() }
            jsonPath("$.error.code") { value("COLLECTION_NOT_PUBLIC") }
        }

        mockMvc.patch("/api/v1/collections/${collection["id"].asText()}") {
            bearer(seller.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"visibility":"PUBLIC"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.visibility") { value("PUBLIC") }
        }

        mockMvc.get("/api/v1/public-collections/${collection["id"].asText()}") {
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(collection["id"].asText()) }
        }

        val firstVersion = mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/publish") {
            bearer(seller.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.version") { value(1) }
            jsonPath("$.snapshot.items[0].bookmarkId") { value(bookmark["id"].asText()) }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.patch("/api/v1/bookmarks/${bookmark["id"].asText()}") {
            bearer(seller.accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"title":"Updated after first version"}"""
        }.andExpect {
            status { isOk() }
        }

        mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/publish") {
            bearer(seller.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.version") { value(2) }
            jsonPath("$.snapshot.items[0].title") { value("Updated after first version") }
        }

        mockMvc.get("/api/v1/marketplace/listings/${listing["id"].asText()}/latest-version") {
        }.andExpect {
            status { isOk() }
            jsonPath("$.version") { value(2) }
        }

        mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/purchases") {
            bearer(buyer.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.listingVersionId") { exists() }
            jsonPath("$.status") { value("PAID") }
        }

        mockMvc.get("/api/v1/access-grants") {
            bearer(buyer.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.length()") { value(1) }
            jsonPath("$[0].source") { value("PURCHASE") }
        }

        mockMvc.post("/api/v1/marketplace/listings/${listing["id"].asText()}/purchases") {
            bearer(buyer.accessToken)
        }.andExpect {
            status { isConflict() }
            jsonPath("$.error.code") { value("ACCESS_ALREADY_GRANTED") }
        }

        assertEquals(1, firstVersion["version"].asInt())
    }

    @Test
    fun `oauth endpoints verify provider identities server side and link by verified email`() {
        val sharedEmail = "oauth-${suffix()}@bookmarket.local"
        fakeOAuthProviderClient.googleIdentity = VerifiedOAuthIdentity(
            provider = "google",
            subject = "google-${suffix()}",
            email = sharedEmail,
            emailVerified = true,
            firstName = "Google",
            lastName = "User",
            pictureUrl = "https://google.example/avatar.png"
        )

        val googleTokens = mockMvc.post("/api/v1/auth/oauth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"credential":"opaque-google-access-token"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.accessToken") { exists() }
            jsonPath("$.refreshToken") { exists() }
        }.andReturn().response.contentAsString.readJson()

        val googleMe = mockMvc.get("/api/v1/users/me") {
            bearer(googleTokens["accessToken"].asText())
        }.andExpect {
            status { isOk() }
            jsonPath("$.email") { value(sharedEmail) }
            jsonPath("$.pictureUrl") { value("https://google.example/avatar.png") }
        }.andReturn().response.contentAsString.readJson()

        fakeOAuthProviderClient.githubIdentity = VerifiedOAuthIdentity(
            provider = "github",
            subject = "github-${suffix()}",
            email = sharedEmail,
            emailVerified = true,
            firstName = "GitHub User",
            lastName = null,
            pictureUrl = "https://github.example/avatar.png"
        )

        val githubTokens = mockMvc.post("/api/v1/auth/oauth/github") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"code":"github-auth-code","redirectUri":"https://bmkt.example/oauth/github"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.accessToken") { exists() }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.get("/api/v1/users/me") {
            bearer(githubTokens["accessToken"].asText())
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(googleMe["id"].asText()) }
            jsonPath("$.email") { value(sharedEmail) }
        }

        fakeOAuthProviderClient.googleIdentity = VerifiedOAuthIdentity(
            provider = "google",
            subject = "unverified-${suffix()}",
            email = "unverified-${suffix()}@bookmarket.local",
            emailVerified = false,
            firstName = null,
            lastName = null,
            pictureUrl = null
        )

        mockMvc.post("/api/v1/auth/oauth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"credential":"unverified-google-token"}"""
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }
    }

    @Test
    fun `oauth state is redis backed single use and rejects missing state records`() {
        fakeOAuthProviderClient.googleIdentity = VerifiedOAuthIdentity(
            provider = "google",
            subject = "state-google-${suffix()}",
            email = "state-google-${suffix()}@bookmarket.local",
            emailVerified = true,
            firstName = "State",
            lastName = "User",
            pictureUrl = null
        )

        val state = mockMvc.post("/api/v1/auth/oauth/state") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"provider":"google","pkceVerifier":"pkce-${suffix()}"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.state") { exists() }
        }.andReturn().response.contentAsString.readJson()["state"].asText()

        mockMvc.post("/api/v1/auth/oauth/state") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"provider":"facebook"}"""
        }.andExpect {
            status { isBadRequest() }
            jsonPath("$.error.code") { value("OAUTH_PROVIDER_INVALID") }
        }

        mockMvc.post("/api/v1/auth/oauth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "credential" to "stateful-google-token",
                    "state" to state
                )
            )
        }.andExpect {
            status { isOk() }
            jsonPath("$.accessToken") { exists() }
            jsonPath("$.refreshToken") { exists() }
        }

        mockMvc.post("/api/v1/auth/oauth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "credential" to "stateful-google-token",
                    "state" to state
                )
            )
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }

        mockMvc.post("/api/v1/auth/oauth/google") {
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(
                mapOf(
                    "credential" to "stateful-google-token",
                    "state" to "missing-${suffix()}"
                )
            )
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_INVALID") }
        }
    }


    @Test
    fun `redis backs idempotency metadata status rate limits and public profile cache invalidation`() {
        val auth = signup()
        val idempotencyKey = "create-${suffix()}"

        val firstCreate = mockMvc.post("/api/v1/bookmarks") {
            bearer(auth.accessToken)
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://idempotent.example/${suffix()}"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.metadataStatus") { value("PENDING") }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.post("/api/v1/bookmarks") {
            bearer(auth.accessToken)
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("url" to firstCreate["url"].asText()))
        }.andExpect {
            status { isOk() }
            jsonPath("$.id") { value(firstCreate["id"].asText()) }
        }

        mockMvc.post("/api/v1/bookmarks") {
            bearer(auth.accessToken)
            header("Idempotency-Key", idempotencyKey)
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"https://different.example/${suffix()}"}"""
        }.andExpect {
            status { isConflict() }
            jsonPath("$.error.code") { value("IDEMPOTENCY_CONFLICT") }
        }

        val refetchKey = "refetch-${suffix()}"
        val firstRefetch = mockMvc.post("/api/v1/bookmarks/${firstCreate["id"].asText()}/metadata-refetch") {
            bearer(auth.accessToken)
            header("Idempotency-Key", refetchKey)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.metadataVersion") { value(2) }
        }.andReturn().response.contentAsString.readJson()

        mockMvc.post("/api/v1/bookmarks/${firstCreate["id"].asText()}/metadata-refetch") {
            bearer(auth.accessToken)
            header("Idempotency-Key", refetchKey)
            contentType = MediaType.APPLICATION_JSON
            content = "{}"
        }.andExpect {
            status { isAccepted() }
            jsonPath("$.metadataVersion") { value(firstRefetch["metadataVersion"].asInt()) }
        }

        mockMvc.get("/api/v1/bookmarks/${firstCreate["id"].asText()}/metadata-status") {
            bearer(auth.accessToken)
        }.andExpect {
            status { isOk() }
            jsonPath("$.metadataStatus") { value("PENDING") }
            jsonPath("$.metadataVersion") { value(2) }
        }

        val emptyPublicBookmarks = mockMvc.get("/api/v1/public-profiles/${auth.username}/bookmarks") {
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString.readJson()
        assertEquals(1, emptyPublicBookmarks.size())

        val newBookmark = createBookmark(auth.accessToken, "https://cache-invalidation.example/${suffix()}", null)
        mockMvc.get("/api/v1/public-profiles/${auth.username}/bookmarks") {
        }.andExpect {
            status { isOk() }
            jsonPath("$[0].id") { value(newBookmark["id"].asText()) }
            jsonPath("$.length()") { value(2) }
        }

        val rateLimitError = assertThrows(ApiException::class.java) {
            val subject = "rate-${suffix()}"
            rateLimitService.requireWithinLimit("integration-test", subject, 2, 60)
            rateLimitService.requireWithinLimit("integration-test", subject, 2, 60)
            rateLimitService.requireWithinLimit("integration-test", subject, 2, 60)
        }
        assertEquals(HttpStatus.TOO_MANY_REQUESTS, rateLimitError.status)
        assertEquals("RATE_LIMITED", rateLimitError.code)
    }

    @Test
    fun `metadata events refresh job status cache and reindex completed bookmark metadata idempotently`() {
        val auth = signup()
        val bookmark = createBookmark(auth.accessToken, "https://metadata-event.example/${suffix()}", null)
        fakeBookmarkSearchIndex.clear()

        jdbcTemplate.update(
            """
            UPDATE bookmark_metadata
            SET status = 'READY'::metadata_status,
                title = 'Fetched Metadata Title',
                description = 'Fetched metadata description',
                favicon_url = 'https://metadata-event.example/favicon.ico',
                canonical_url = 'https://metadata-event.example/canonical',
                fetched_at = now(),
                updated_at = now()
            WHERE bookmark_id = ?::uuid
            """.trimIndent(),
            bookmark["id"].asText()
        )

        val event = objectMapper.writeValueAsString(
            mapOf(
                "eventId" to UUID.randomUUID().toString(),
                "eventType" to "metadata.fetch.completed",
                "eventVersion" to 1,
                "occurredAt" to "2026-05-16T00:00:00Z",
                "producer" to "services/metadata-worker",
                "idempotencyKey" to "bookmark:${bookmark["id"].asText()}:metadata:1:completed",
                "subject" to mapOf("type" to "bookmark", "id" to bookmark["id"].asText()),
                "payload" to mapOf(
                    "bookmarkId" to bookmark["id"].asText(),
                    "metadataVersion" to 1,
                    "canonicalUrl" to "https://metadata-event.example/canonical",
                    "title" to "Fetched Metadata Title",
                    "description" to "Fetched metadata description",
                    "faviconUrl" to "https://metadata-event.example/favicon.ico",
                    "fetchedAt" to "2026-05-16T00:00:00Z"
                )
            )
        )

        metadataEventsConsumer().consume(event)
        metadataEventsConsumer().consume(event)

        assertEquals(1, fakeBookmarkSearchIndex.indexed.size)
        assertEquals("Fetched Metadata Title", fakeBookmarkSearchIndex.indexed.single().bookmark.title)
        assertEquals(auth.userId, fakeBookmarkSearchIndex.indexed.single().userId.toString())

        val cachedStatus = metadataJobStatusCache.get(UUID.fromString(auth.userId), UUID.fromString(bookmark["id"].asText()))
        assertEquals("READY", cachedStatus?.metadataStatus)
        assertEquals(1, cachedStatus?.metadataVersion)
    }

    @Test
    fun `ops search rebuild reindexes active bookmarks from Postgres with owner scope`() {
        val owner = signup()
        val otherUser = signup()
        val ownerBookmark = createBookmark(owner.accessToken, "https://rebuild-owner.example/${suffix()}", null)
        val otherBookmark = createBookmark(otherUser.accessToken, "https://rebuild-other.example/${suffix()}", null)
        val deletedBookmark = createBookmark(owner.accessToken, "https://rebuild-deleted.example/${suffix()}", null)

        mockMvc.delete("/api/v1/bookmarks/${deletedBookmark["id"].asText()}") {
            bearer(owner.accessToken)
        }.andExpect {
            status { isNoContent() }
        }

        fakeBookmarkSearchIndex.clear()

        mockMvc.post("/api/v1/ops/search/bookmarks/rebuild") {
            header("X-Bookmarket-Ops-Token", "wrong-token")
        }.andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_REQUIRED") }
        }
        assertEquals(0, fakeBookmarkSearchIndex.indexed.size)

        val rebuild = mockMvc.post("/api/v1/ops/search/bookmarks/rebuild") {
            header("X-Bookmarket-Ops-Token", "test-rebuild-token")
        }.andExpect {
            status { isOk() }
            jsonPath("$.indexed") { exists() }
        }.andReturn().response.contentAsString.readJson()

        val indexedByBookmarkId = fakeBookmarkSearchIndex.indexed.associateBy { it.bookmark.id }
        assertEquals(fakeBookmarkSearchIndex.indexed.size, rebuild["indexed"].asInt())
        assertEquals(owner.userId, indexedByBookmarkId[ownerBookmark["id"].asText()]?.userId.toString())
        assertEquals(otherUser.userId, indexedByBookmarkId[otherBookmark["id"].asText()]?.userId.toString())
        assertFalse(indexedByBookmarkId.containsKey(deletedBookmark["id"].asText()))
    }

    private fun signup(): TestAuth {
        val email = "test-${suffix()}@bookmarket.local"
        val tokenResponse = mockMvc.post("/api/v1/auth/signup") {
            contentType = MediaType.APPLICATION_JSON
            content = """{"email":"$email","password":"bookmarket-pass-123"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.accessToken") { exists() }
        }.andReturn().response.contentAsString.readJson()

        val accessToken = tokenResponse["accessToken"].asText()
        val me = mockMvc.get("/api/v1/users/me") {
            bearer(accessToken)
        }.andExpect {
            status { isOk() }
        }.andReturn().response.contentAsString.readJson()

        return TestAuth(
            accessToken = accessToken,
            refreshToken = tokenResponse["refreshToken"].asText(),
            userId = me["id"].asText(),
            username = me["username"].asText()
        )
    }

    private fun createCategory(accessToken: String, name: String): JsonNode =
        mockMvc.post("/api/v1/categories") {
            bearer(accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"name":"$name"}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.name") { value(name) }
        }.andReturn().response.contentAsString.readJson()

    private fun createBookmark(accessToken: String, url: String, categoryName: String?): JsonNode {
        val categoryPart = categoryName?.let { ""","categoryName":"$it"""" } ?: ""
        return mockMvc.post("/api/v1/bookmarks") {
            bearer(accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = """{"url":"$url"$categoryPart}"""
        }.andExpect {
            status { isOk() }
            jsonPath("$.url") { value(if (url.contains("://")) url else "https://$url") }
            jsonPath("$.metadataStatus") { value("PENDING") }
        }.andReturn().response.contentAsString.readJson()
    }

    private fun createApiToken(accessToken: String, name: String, scopes: List<String>): JsonNode =
        mockMvc.post("/api/v1/api-tokens") {
            bearer(accessToken)
            contentType = MediaType.APPLICATION_JSON
            content = objectMapper.writeValueAsString(mapOf("name" to name, "scopes" to scopes))
        }.andExpect {
            status { isCreated() }
            jsonPath("$.token") { exists() }
            jsonPath("$.tokenMetadata.name") { value(name) }
        }.andReturn().response.contentAsString.readJson()

    private fun MockHttpServletRequestDsl.bearer(accessToken: String) {
        header("Authorization", "Bearer $accessToken")
    }

    private fun org.springframework.test.web.servlet.ResultActionsDsl.andExpectAuthRequired(): org.springframework.test.web.servlet.ResultActionsDsl =
        andExpect {
            status { isUnauthorized() }
            jsonPath("$.error.code") { value("AUTH_REQUIRED") }
        }

    private fun assertNoPersistenceSecrets(responseBody: String) {
        val forbiddenFields = listOf(
            "passwordHash",
            "password_hash",
            "tokenHash",
            "token_hash",
            "providerSubject",
            "provider_subject",
            "deletedAt",
            "deleted_at",
            "revokedAt",
            "revoked_at"
        )
        forbiddenFields.forEach { field ->
            assertFalse(responseBody.contains(field), "Response must not expose persistence field $field: $responseBody")
        }
    }

    private fun String.readJson(): JsonNode = objectMapper.readTree(this)

    private fun suffix(): String = UUID.randomUUID().toString().replace("-", "").take(10)

    private fun metadataEventsConsumer(): MetadataEventsConsumer =
        MetadataEventsConsumer(
            objectMapper = objectMapper,
            bookmarkRepository = bookmarkRepository,
            searchService = searchService,
            metadataJobStatusCache = metadataJobStatusCache,
            publicProfileCache = publicProfileCache,
            processedEventRepository = processedEventRepository
        )

    data class TestAuth(
        val accessToken: String,
        val refreshToken: String,
        val userId: String,
        val username: String
    )

    companion object {
        @Container
        @JvmStatic
        val postgres = PostgreSQLContainer<Nothing>("postgres:17-alpine").apply {
            withDatabaseName("bookmarket")
            withUsername("bookmarket")
            withPassword("bookmarket")
        }

        @Container
        @JvmStatic
        val redis = GenericContainer<Nothing>(DockerImageName.parse("redis:7.4-alpine")).apply {
            withExposedPorts(6379)
        }

        @JvmStatic
        @DynamicPropertySource
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("spring.flyway.enabled") { "true" }
            registry.add("bookmarket.auth.secret") { "test-only-bookmarket-secret-with-32-characters" }
            registry.add("spring.redis.url") { "redis://${redis.host}:${redis.getMappedPort(6379)}" }
            registry.add("bookmarket.redis.enabled") { "true" }
            registry.add("bookmarket.redis.namespace") { "bookmarket:test:${UUID.randomUUID()}" }
            registry.add("bookmarket.redis.auth-rate-limit-max-requests") { "1000" }
            registry.add("bookmarket.search.rebuild-token") { "test-rebuild-token" }
        }
    }
}

@TestConfiguration
class OAuthProviderTestConfig {
    @Bean
    @Primary
    fun fakeOAuthProviderClient(): FakeOAuthProviderClient =
        FakeOAuthProviderClient()

    @Bean
    @Primary
    fun fakeBookmarkSearchIndex(): FakeBookmarkSearchIndex =
        FakeBookmarkSearchIndex()
}

class FakeOAuthProviderClient : OAuthProviderClient {
    var googleIdentity: VerifiedOAuthIdentity? = null
    var githubIdentity: VerifiedOAuthIdentity? = null

    override fun verifyGoogle(request: OAuthLoginRequest): VerifiedOAuthIdentity =
        googleIdentity ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "Google OAuth proof is invalid")

    override fun verifyGithub(request: OAuthLoginRequest): VerifiedOAuthIdentity =
        githubIdentity ?: throw ApiException(HttpStatus.UNAUTHORIZED, "AUTH_INVALID", "GitHub OAuth proof is invalid")
}

class FakeBookmarkSearchIndex : BookmarkSearchIndex {
    val indexed = mutableListOf<IndexedBookmark>()
    val deleted = mutableListOf<UUID>()
    var searchResult: List<BookmarkDto>? = null

    override fun search(userId: UUID, query: String): List<BookmarkDto>? =
        searchResult

    override fun index(bookmark: BookmarkDto, userId: UUID) {
        indexed.add(IndexedBookmark(bookmark = bookmark, userId = userId))
    }

    override fun delete(bookmarkId: UUID) {
        deleted.add(bookmarkId)
    }

    fun clear() {
        indexed.clear()
        deleted.clear()
        searchResult = null
    }

    data class IndexedBookmark(
        val bookmark: BookmarkDto,
        val userId: UUID
    )
}
