package com.bookmarket.api.search

import com.bookmarket.api.bookmarks.BookmarkDto
import java.util.UUID

interface BookmarkSearchIndex {
    fun search(userId: UUID, query: String): List<BookmarkDto>?
    fun index(bookmark: BookmarkDto, userId: UUID)
    fun delete(bookmarkId: UUID)
}
