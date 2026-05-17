package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkDto
import com.bookmarket.api.categories.CategoryDto
import com.fasterxml.jackson.databind.JsonNode
import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.http.HttpEntity
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpMethod
import org.springframework.http.MediaType
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestTemplate
import java.time.Instant
import java.util.UUID
import javax.annotation.PostConstruct

@Component
@ConditionalOnProperty(name = ["bookmarket.search.elasticsearch-enabled"], havingValue = "true")
class ElasticsearchBookmarkSearchIndex(
    private val searchProperties: SearchProperties,
    private val objectMapper: ObjectMapper
) : BookmarkSearchIndex {
    private val logger = LoggerFactory.getLogger(ElasticsearchBookmarkSearchIndex::class.java)
    private val restTemplate = RestTemplate()
    private val headers = HttpHeaders().apply {
        contentType = MediaType.APPLICATION_JSON
    }

    @PostConstruct
    fun ensureIndex() {
        val mapping = mapOf(
            "mappings" to mapOf(
                "properties" to mapOf(
                    "bookmarkId" to mapOf("type" to "keyword"),
                    "userId" to mapOf("type" to "keyword"),
                    "url" to mapOf("type" to "text", "fields" to mapOf("keyword" to mapOf("type" to "keyword"))),
                    "title" to mapOf("type" to "text", "fields" to mapOf("keyword" to mapOf("type" to "keyword"))),
                    "description" to mapOf("type" to "text", "fields" to mapOf("keyword" to mapOf("type" to "keyword"))),
                    "faviconUrl" to mapOf("type" to "keyword", "index" to false),
                    "metadataStatus" to mapOf("type" to "keyword"),
                    "metadataUpdatedAt" to mapOf("type" to "date"),
                    "categoryId" to mapOf("type" to "keyword"),
                    "categoryName" to mapOf("type" to "keyword"),
                    "categoryCreatedAt" to mapOf("type" to "date"),
                    "categoryUpdatedAt" to mapOf("type" to "date"),
                    "createdAt" to mapOf("type" to "date"),
                    "updatedAt" to mapOf("type" to "date")
                )
            )
        )
        runCatching {
            if (!indexExists()) {
                restTemplate.exchange(indexUrl(), HttpMethod.PUT, HttpEntity(objectMapper.writeValueAsString(mapping), headers), String::class.java)
            }
        }.onFailure {
            logger.warn("Failed to ensure Elasticsearch bookmark index; Postgres search fallback will be used", it)
        }
    }

    override fun search(userId: UUID, query: String): List<BookmarkDto>? {
        val normalizedQuery = query.trim()
        if (normalizedQuery.isBlank()) {
            return emptyList()
        }
        val wildcardValue = "*${escapeWildcard(normalizedQuery.lowercase())}*"
        val wildcardQueries = listOf("title.keyword", "url.keyword", "description.keyword").map { field ->
            mapOf(
                "wildcard" to mapOf(
                    field to mapOf(
                        "value" to wildcardValue,
                        "case_insensitive" to true
                    )
                )
            )
        }

        val body = mapOf(
            "size" to 50,
            "query" to mapOf(
                "bool" to mapOf(
                    "filter" to listOf(mapOf("term" to mapOf("userId" to userId.toString()))),
                    "should" to wildcardQueries,
                    "minimum_should_match" to 1
                )
            ),
            "sort" to listOf(mapOf("createdAt" to mapOf("order" to "desc")))
        )

        return runCatching {
            val response = restTemplate.postForObject("${indexUrl()}/_search", HttpEntity(objectMapper.writeValueAsString(body), headers), String::class.java)
                ?: return null
            parseSearchResponse(response)
        }.onFailure {
            logger.warn("Elasticsearch bookmark search failed; falling back to Postgres", it)
        }.getOrNull()
    }

    override fun index(bookmark: BookmarkDto, userId: UUID) {
        val document = mapOf(
            "bookmarkId" to bookmark.id,
            "userId" to userId.toString(),
            "url" to bookmark.url,
            "title" to bookmark.title,
            "description" to bookmark.description,
            "faviconUrl" to bookmark.faviconUrl,
            "metadataStatus" to bookmark.metadataStatus,
            "metadataUpdatedAt" to bookmark.metadataUpdatedAt?.toString(),
            "categoryId" to bookmark.category?.id,
            "categoryName" to bookmark.category?.name,
            "categoryCreatedAt" to bookmark.category?.createdAt?.toString(),
            "categoryUpdatedAt" to bookmark.category?.updatedAt?.toString(),
            "createdAt" to bookmark.createdAt.toString(),
            "updatedAt" to bookmark.updatedAt.toString()
        )

        runCatching {
            restTemplate.exchange(
                "${indexUrl()}/_doc/${bookmark.id}",
                HttpMethod.PUT,
                HttpEntity(objectMapper.writeValueAsString(document), headers),
                String::class.java
            )
        }.onFailure {
            logger.warn("Failed to index bookmark ${bookmark.id}; search can be rebuilt from Postgres", it)
        }
    }

    override fun delete(bookmarkId: UUID) {
        runCatching {
            restTemplate.exchange("${indexUrl()}/_doc/$bookmarkId", HttpMethod.DELETE, HttpEntity.EMPTY, String::class.java)
        }.onFailure {
            logger.warn("Failed to delete bookmark $bookmarkId from Elasticsearch", it)
        }
    }

    private fun parseSearchResponse(response: String): List<BookmarkDto> {
        val root = objectMapper.readTree(response)
        val hits = root.path("hits").path("hits")
        if (!hits.isArray) {
            return emptyList()
        }
        return hits.mapNotNull { hit ->
            val source = hit.path("_source")
            if (source.isMissingNode) null else source.toBookmarkDto()
        }
    }

    private fun JsonNode.toBookmarkDto(): BookmarkDto =
        BookmarkDto(
            id = path("bookmarkId").asText(),
            url = path("url").asText(),
            title = path("title").textOrNull(),
            description = path("description").textOrNull(),
            faviconUrl = path("faviconUrl").textOrNull(),
            metadataStatus = path("metadataStatus").asText("PENDING"),
            metadataUpdatedAt = path("metadataUpdatedAt").instantOrNull(),
            createdAt = Instant.parse(path("createdAt").asText()),
            updatedAt = Instant.parse(path("updatedAt").asText()),
            category = path("categoryId").textOrNull()?.let { categoryId ->
                CategoryDto(
                    id = categoryId,
                    name = path("categoryName").asText(),
                    createdAt = path("categoryCreatedAt").instantOrEpoch(),
                    updatedAt = path("categoryUpdatedAt").instantOrEpoch()
                )
            }
        )

    private fun JsonNode.textOrNull(): String? =
        if (isNull || isMissingNode) null else asText()

    private fun JsonNode.instantOrEpoch(): Instant =
        if (isNull || isMissingNode || asText().isBlank()) Instant.EPOCH else Instant.parse(asText())

    private fun JsonNode.instantOrNull(): Instant? =
        if (isNull || isMissingNode || asText().isBlank()) null else Instant.parse(asText())

    private fun escapeWildcard(value: String): String =
        value
            .replace("\\", "\\\\")
            .replace("*", "\\*")
            .replace("?", "\\?")

    private fun indexExists(): Boolean =
        try {
            restTemplate.exchange(indexUrl(), HttpMethod.HEAD, HttpEntity.EMPTY, String::class.java).statusCode.is2xxSuccessful
        } catch (exception: HttpClientErrorException.NotFound) {
            false
        }

    private fun indexUrl(): String =
        "${searchProperties.elasticsearchUrl.trimEnd('/')}/${searchProperties.bookmarksIndex}"
}
