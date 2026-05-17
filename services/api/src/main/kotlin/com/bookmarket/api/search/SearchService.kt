package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkDto
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class SearchService(
    private val bookmarkSearchRepository: BookmarkSearchRepository,
    private val bookmarkSearchIndex: BookmarkSearchIndex
) {
    fun searchBookmarks(userId: UUID, query: String): List<BookmarkDto> {
        if (query.trim().isBlank()) {
            return emptyList()
        }
        val indexedResults = bookmarkSearchIndex.search(userId, query)
        if (!indexedResults.isNullOrEmpty()) {
            return indexedResults
        }

        return bookmarkSearchRepository.search(userId, query)
    }

    fun indexBookmark(bookmark: BookmarkDto, userId: UUID) {
        bookmarkSearchIndex.index(bookmark, userId)
    }

    fun rebuildBookmarkIndex(): SearchRebuildResult {
        val documents = bookmarkSearchRepository.findAllForReindex()
        for (document in documents) {
            bookmarkSearchIndex.index(document.bookmark, document.userId)
        }
        return SearchRebuildResult(indexed = documents.size)
    }

    fun deleteBookmark(bookmarkId: UUID) {
        bookmarkSearchIndex.delete(bookmarkId)
    }

    data class SearchRebuildResult(
        val indexed: Int
    )
}
