package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkDto
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.stereotype.Component
import java.util.UUID

@Component
@ConditionalOnProperty(name = ["bookmarket.search.elasticsearch-enabled"], havingValue = "false", matchIfMissing = true)
class NoopBookmarkSearchIndex : BookmarkSearchIndex {
    override fun search(userId: UUID, query: String): List<BookmarkDto>? = null

    override fun index(bookmark: BookmarkDto, userId: UUID) {
    }

    override fun delete(bookmarkId: UUID) {
    }
}
