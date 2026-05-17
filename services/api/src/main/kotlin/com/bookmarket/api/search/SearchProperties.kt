package com.bookmarket.api.search

import org.springframework.boot.context.properties.ConfigurationProperties
import org.springframework.boot.context.properties.ConstructorBinding

@ConstructorBinding
@ConfigurationProperties(prefix = "bookmarket.search")
data class SearchProperties(
    val elasticsearchEnabled: Boolean = false,
    val elasticsearchUrl: String = "http://localhost:9200",
    val bookmarksIndex: String = "bookmarket-bookmarks",
    val rebuildToken: String = ""
)
