package com.bookmarket.api.bookmarks

import com.bookmarket.api.categories.CategoryRepository
import com.bookmarket.api.common.ApiException
import com.bookmarket.api.operational.MetadataJobStatusCache
import com.bookmarket.api.operational.PublicProfileCache
import com.bookmarket.api.search.SearchService
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import java.util.UUID

@Service
class BookmarkService(
    private val bookmarkRepository: BookmarkRepository,
    private val categoryRepository: CategoryRepository,
    private val urlNormalizer: BookmarkUrlNormalizer,
    private val eventPublisher: BookmarkEventPublisher,
    private val searchService: SearchService,
    private val metadataJobStatusCache: MetadataJobStatusCache,
    private val publicProfileCache: PublicProfileCache
) {
    fun create(userId: UUID, request: CreateBookmarkRequest): BookmarkDto {
        val categoryId = request.categoryName
            ?.takeIf { it.isNotBlank() }
            ?.let {
                categoryRepository.findByName(userId, it)
                    ?: throw ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found")
            }
            ?.let { UUID.fromString(it.id) }
        val created = bookmarkRepository.create(userId, urlNormalizer.normalize(request.url), categoryId)
        eventPublisher.bookmarkCreated(created.bookmark, userId.toString(), created.metadataVersion)
        val status = MetadataJobStatusDto(
            bookmarkId = created.bookmark.id,
            metadataStatus = created.bookmark.metadataStatus,
            metadataVersion = created.metadataVersion
        )
        metadataJobStatusCache.put(userId, status)
        eventPublisher.metadataFetchRequested(created.bookmark, userId.toString(), created.metadataVersion, "bookmark.create")
        searchService.indexBookmark(created.bookmark, userId)
        publicProfileCache.evictAllPublicProfiles()
        return created.bookmark
    }

    fun list(userId: UUID, categoryName: String?): List<BookmarkDto> =
        bookmarkRepository.findAll(userId, categoryName)

    fun get(userId: UUID, id: UUID): BookmarkDto =
        bookmarkRepository.findById(userId, id)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")

    fun update(userId: UUID, id: UUID, request: UpdateBookmarkRequest): BookmarkDto {
        var bookmark = get(userId, id)
        val changedFields = mutableListOf<String>()

        if (request.title != null) {
            bookmark = bookmarkRepository.updateTitle(userId, id, request.title)
            changedFields.add("titleOverride")
        }

        if (request.categoryName != null) {
            val categoryId = request.categoryName
                .takeIf { it.isNotBlank() }
                ?.let {
                    categoryRepository.findByName(userId, it)
                        ?: throw ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found")
                }
                ?.let { UUID.fromString(it.id) }
            bookmark = bookmarkRepository.updateCategory(userId, id, categoryId)
            changedFields.add("categoryId")
        }

        if (changedFields.isNotEmpty()) {
            eventPublisher.bookmarkUpdated(bookmark, userId.toString(), changedFields)
            searchService.indexBookmark(bookmark, userId)
            publicProfileCache.evictAllPublicProfiles()
        }
        return bookmark
    }

    fun updateCategory(userId: UUID, id: UUID, categoryId: UUID?): BookmarkDto {
        if (categoryId != null && categoryRepository.findById(userId, categoryId) == null) {
            throw ApiException(HttpStatus.NOT_FOUND, "CATEGORY_NOT_FOUND", "Category not found")
        }
        val bookmark = bookmarkRepository.updateCategory(userId, id, categoryId)
        eventPublisher.bookmarkUpdated(bookmark, userId.toString(), listOf("categoryId"))
        searchService.indexBookmark(bookmark, userId)
        publicProfileCache.evictAllPublicProfiles()
        return bookmark
    }

    fun requestMetadataRefetch(userId: UUID, id: UUID): MetadataJobStatusDto {
        val bookmark = get(userId, id)
        val status = bookmarkRepository.markMetadataPending(userId, id)
        metadataJobStatusCache.put(userId, status)
        eventPublisher.metadataFetchRequested(bookmark, userId.toString(), status.metadataVersion, "bookmark.refetch")
        bookmarkRepository.findById(userId, id)?.let { searchService.indexBookmark(it, userId) }
        publicProfileCache.evictAllPublicProfiles()
        return status
    }

    fun metadataStatus(userId: UUID, id: UUID): MetadataJobStatusDto {
        val current = bookmarkRepository.metadataStatus(userId, id)
        val cached = metadataJobStatusCache.get(userId, id)
        if (
            cached != null &&
            cached.metadataVersion == current.metadataVersion &&
            current.metadataStatus == "PENDING"
        ) {
            return cached
        }
        metadataJobStatusCache.put(userId, current)
        return current
    }

    fun delete(userId: UUID, id: UUID) {
        get(userId, id)
        bookmarkRepository.delete(userId, id)
        eventPublisher.bookmarkDeleted(id.toString(), userId.toString())
        searchService.deleteBookmark(id)
        publicProfileCache.evictAllPublicProfiles()
    }
}
