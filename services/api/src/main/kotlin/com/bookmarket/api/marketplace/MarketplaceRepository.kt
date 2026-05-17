package com.bookmarket.api.marketplace

import com.bookmarket.api.bookmarks.BookmarkRepository
import com.bookmarket.api.common.ApiException
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.dao.DuplicateKeyException
import org.springframework.http.HttpStatus
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.jdbc.core.RowMapper
import org.springframework.stereotype.Repository
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.sql.ResultSet
import java.time.Instant
import java.util.UUID

@Repository
class MarketplaceRepository(
    private val jdbcTemplate: JdbcTemplate,
    private val objectMapper: ObjectMapper,
    transactionManager: PlatformTransactionManager
) {
    private val transactionTemplate = TransactionTemplate(transactionManager)

    fun listCollections(ownerId: UUID): List<CollectionDto> =
        jdbcTemplate.query(
            """
            SELECT id, title, description, visibility::text AS visibility, created_at, updated_at
            FROM collections
            WHERE owner_user_id = ?::uuid AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC
            """.trimIndent(),
            collectionRowMapper,
            ownerId.toString()
        ).map { it.toDto(loadCollectionItems(it.id)) }

    fun createCollection(ownerId: UUID, request: CreateCollectionRequest): CollectionDto =
        transactionTemplate.execute {
            val row = jdbcTemplate.queryForObject(
                """
                INSERT INTO collections (owner_user_id, title, description, visibility)
                VALUES (?::uuid, ?, ?, ?::collection_visibility)
                RETURNING id, title, description, visibility::text AS visibility, created_at, updated_at
                """.trimIndent(),
                collectionRowMapper,
                ownerId.toString(),
                normalizeTitle(request.title),
                request.description?.trim()?.takeIf { it.isNotBlank() },
                normalizeVisibility(request.visibility)
            ) ?: throw IllegalStateException("Collection insert did not return a row")
            replaceCollectionItems(ownerId, row.id, request.items)
            row.toDto(loadCollectionItems(row.id))
        } ?: throw IllegalStateException("Collection creation transaction returned no collection")

    fun getOwnedCollection(ownerId: UUID, collectionId: UUID): CollectionDto =
        findOwnedCollection(ownerId, collectionId)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "COLLECTION_NOT_FOUND", "Collection not found")

    fun getPublicCollection(collectionId: UUID): CollectionDto =
        jdbcTemplate.query(
            """
            SELECT id, title, description, visibility::text AS visibility, created_at, updated_at
            FROM collections
            WHERE id = ?::uuid
              AND deleted_at IS NULL
              AND visibility IN ('PUBLIC'::collection_visibility, 'UNLISTED'::collection_visibility)
            LIMIT 1
            """.trimIndent(),
            collectionRowMapper,
            collectionId.toString()
        ).firstOrNull()?.let { it.toDto(loadCollectionItems(it.id)) }
            ?: throw ApiException(HttpStatus.NOT_FOUND, "COLLECTION_NOT_FOUND", "Collection not found")

    fun updateCollection(ownerId: UUID, collectionId: UUID, request: UpdateCollectionRequest): CollectionDto =
        transactionTemplate.execute {
            if (findOwnedCollection(ownerId, collectionId) == null) {
                throw ApiException(HttpStatus.NOT_FOUND, "COLLECTION_NOT_FOUND", "Collection not found")
            }
            request.title?.let {
                jdbcTemplate.update(
                    "UPDATE collections SET title = ? WHERE owner_user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL",
                    normalizeTitle(it),
                    ownerId.toString(),
                    collectionId.toString()
                )
            }
            if (request.description != null) {
                jdbcTemplate.update(
                    "UPDATE collections SET description = ? WHERE owner_user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL",
                    request.description.trim().takeIf { it.isNotBlank() },
                    ownerId.toString(),
                    collectionId.toString()
                )
            }
            request.visibility?.let {
                jdbcTemplate.update(
                    "UPDATE collections SET visibility = ?::collection_visibility WHERE owner_user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL",
                    normalizeVisibility(it),
                    ownerId.toString(),
                    collectionId.toString()
                )
            }
            request.items?.let { replaceCollectionItems(ownerId, collectionId, it) }
            getOwnedCollection(ownerId, collectionId)
        } ?: throw IllegalStateException("Collection update transaction returned no collection")

    fun deleteCollection(ownerId: UUID, collectionId: UUID) {
        val updated = jdbcTemplate.update(
            "UPDATE collections SET deleted_at = now() WHERE owner_user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL",
            ownerId.toString(),
            collectionId.toString()
        )
        if (updated == 0) {
            throw ApiException(HttpStatus.NOT_FOUND, "COLLECTION_NOT_FOUND", "Collection not found")
        }
    }

    fun createListing(sellerId: UUID, request: CreateListingRequest): ListingDto {
        val collectionId = parseUuid(request.collectionId, "COLLECTION_ID_INVALID")
        findOwnedCollection(sellerId, collectionId)
            ?: throw ApiException(HttpStatus.NOT_FOUND, "COLLECTION_NOT_FOUND", "Collection not found")

        return try {
            val listingId = jdbcTemplate.queryForObject(
                """
                INSERT INTO marketplace_listings (
                  seller_user_id, collection_id, status, slug, title, description, price_cents, currency
                )
                VALUES (?::uuid, ?::uuid, 'DRAFT'::listing_status, ?, ?, ?, ?, ?)
                RETURNING id
                """.trimIndent(),
                UUID::class.java,
                sellerId.toString(),
                collectionId.toString(),
                request.slug?.let { normalizeSlug(it) },
                normalizeTitle(request.title),
                request.description?.trim()?.takeIf { it.isNotBlank() },
                request.priceCents,
                normalizeCurrency(request.currency)
            ) ?: throw IllegalStateException("Listing insert did not return an id")
            findOwnedListing(sellerId, listingId)
                ?: throw IllegalStateException("Created listing could not be loaded")
        } catch (exception: DuplicateKeyException) {
            throw ApiException(HttpStatus.CONFLICT, "LISTING_SLUG_TAKEN", "Listing slug is already taken")
        }
    }

    fun publishListing(sellerId: UUID, listingId: UUID): ListingVersionDto =
        transactionTemplate.execute {
            val listing = findOwnedListing(sellerId, listingId)
                ?: throw ApiException(HttpStatus.NOT_FOUND, "LISTING_NOT_FOUND", "Listing not found")
            val collection = getOwnedCollection(sellerId, UUID.fromString(listing.collectionId))
            if (collection.visibility == "PRIVATE") {
                throw ApiException(HttpStatus.CONFLICT, "COLLECTION_NOT_PUBLIC", "Collection must be public or unlisted before publishing")
            }

            val version = nextListingVersion(listingId)
            val snapshot = listingSnapshot(collection)
            val versionId = jdbcTemplate.queryForObject(
                """
                INSERT INTO listing_versions (listing_id, version, collection_id, snapshot, price_cents, currency)
                VALUES (?::uuid, ?, ?::uuid, ?::jsonb, ?, ?)
                RETURNING id
                """.trimIndent(),
                UUID::class.java,
                listingId.toString(),
                version,
                collection.id,
                objectMapper.writeValueAsString(snapshot),
                listing.priceCents,
                listing.currency
            ) ?: throw IllegalStateException("Listing version insert did not return an id")

            jdbcTemplate.update(
                """
                UPDATE marketplace_listings
                SET status = 'PUBLISHED'::listing_status,
                    published_at = COALESCE(published_at, now()),
                    slug = COALESCE(slug, ?)
                WHERE seller_user_id = ?::uuid AND id = ?::uuid
                """.trimIndent(),
                slugWithId(listing.title, listingId),
                sellerId.toString(),
                listingId.toString()
            )
            findListingVersion(versionId)
                ?: throw IllegalStateException("Created listing version could not be loaded")
        } ?: throw IllegalStateException("Listing publish transaction returned no version")

    fun listPublishedListings(): List<ListingDto> =
        jdbcTemplate.query(
            """
            SELECT ${listingColumns()}
            FROM marketplace_listings ml
            WHERE ml.status = 'PUBLISHED'::listing_status
            ORDER BY ml.published_at DESC NULLS LAST, ml.created_at DESC, ml.id DESC
            """.trimIndent(),
            listingMapper
        )

    fun getPublishedListing(slugOrId: String): ListingDto {
        val id = slugOrId.toUuidOrNull()
        return jdbcTemplate.query(
            """
            SELECT ${listingColumns()}
            FROM marketplace_listings ml
            WHERE ml.status = 'PUBLISHED'::listing_status
              AND (ml.slug = ? OR (?::uuid IS NOT NULL AND ml.id = ?::uuid))
            LIMIT 1
            """.trimIndent(),
            listingMapper,
            slugOrId,
            id?.toString(),
            id?.toString()
        ).firstOrNull() ?: throw ApiException(HttpStatus.NOT_FOUND, "LISTING_NOT_FOUND", "Listing not found")
    }

    fun getLatestVersionForPublishedListing(slugOrId: String): ListingVersionDto {
        val listing = getPublishedListing(slugOrId)
        return latestVersion(UUID.fromString(listing.id))
            ?: throw ApiException(HttpStatus.NOT_FOUND, "LISTING_VERSION_NOT_FOUND", "Listing version not found")
    }

    fun createFreePurchase(buyerId: UUID, listingId: UUID): PurchaseDto =
        transactionTemplate.execute {
            val listing = getPublishedListing(listingId.toString())
            val version = latestVersion(listingId)
                ?: throw ApiException(HttpStatus.CONFLICT, "LISTING_VERSION_NOT_FOUND", "Listing has no published version")
            if (version.priceCents != 0) {
                throw ApiException(HttpStatus.PAYMENT_REQUIRED, "PAYMENT_NOT_CONFIGURED", "Paid marketplace checkout is not configured")
            }
            if (hasActiveGrant(buyerId, UUID.fromString(version.id))) {
                throw ApiException(HttpStatus.CONFLICT, "ACCESS_ALREADY_GRANTED", "Access has already been granted")
            }

            val purchaseId = jdbcTemplate.queryForObject(
                """
                INSERT INTO purchases (
                  buyer_user_id, listing_id, listing_version_id, status, amount_cents, currency, purchased_at
                )
                VALUES (?::uuid, ?::uuid, ?::uuid, 'PAID'::purchase_status, 0, ?, now())
                RETURNING id
                """.trimIndent(),
                UUID::class.java,
                buyerId.toString(),
                listing.id,
                version.id,
                version.currency
            ) ?: throw IllegalStateException("Purchase insert did not return an id")

            jdbcTemplate.update(
                """
                INSERT INTO access_grants (user_id, listing_version_id, purchase_id, source)
                VALUES (?::uuid, ?::uuid, ?::uuid, 'PURCHASE'::access_grant_source)
                ON CONFLICT DO NOTHING
                """.trimIndent(),
                buyerId.toString(),
                version.id,
                purchaseId.toString()
            )
            findPurchase(purchaseId)
                ?: throw IllegalStateException("Created purchase could not be loaded")
        } ?: throw IllegalStateException("Purchase transaction returned no purchase")

    fun listPurchases(buyerId: UUID): List<PurchaseDto> =
        jdbcTemplate.query(
            """
            SELECT ${purchaseColumns()}
            FROM purchases p
            WHERE p.buyer_user_id = ?::uuid
            ORDER BY p.created_at DESC, p.id DESC
            """.trimIndent(),
            purchaseMapper,
            buyerId.toString()
        )

    fun listAccessGrants(userId: UUID): List<AccessGrantDto> =
        jdbcTemplate.query(
            """
            SELECT ${grantColumns()}
            FROM access_grants ag
            WHERE ag.user_id = ?::uuid AND ag.revoked_at IS NULL
            ORDER BY ag.created_at DESC, ag.id DESC
            """.trimIndent(),
            grantMapper,
            userId.toString()
        )

    private fun findOwnedCollection(ownerId: UUID, collectionId: UUID): CollectionDto? =
        jdbcTemplate.query(
            """
            SELECT id, title, description, visibility::text AS visibility, created_at, updated_at
            FROM collections
            WHERE owner_user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL
            LIMIT 1
            """.trimIndent(),
            collectionRowMapper,
            ownerId.toString(),
            collectionId.toString()
        ).firstOrNull()?.let { it.toDto(loadCollectionItems(it.id)) }

    private fun findOwnedListing(sellerId: UUID, listingId: UUID): ListingDto? =
        jdbcTemplate.query(
            """
            SELECT ${listingColumns()}
            FROM marketplace_listings ml
            WHERE ml.seller_user_id = ?::uuid AND ml.id = ?::uuid
            LIMIT 1
            """.trimIndent(),
            listingMapper,
            sellerId.toString(),
            listingId.toString()
        ).firstOrNull()

    private fun findListingVersion(listingVersionId: UUID): ListingVersionDto? =
        jdbcTemplate.query(
            """
            SELECT ${listingVersionColumns()}
            FROM listing_versions lv
            WHERE lv.id = ?::uuid
            LIMIT 1
            """.trimIndent(),
            listingVersionMapper,
            listingVersionId.toString()
        ).firstOrNull()

    private fun findPurchase(purchaseId: UUID): PurchaseDto? =
        jdbcTemplate.query(
            """
            SELECT ${purchaseColumns()}
            FROM purchases p
            WHERE p.id = ?::uuid
            LIMIT 1
            """.trimIndent(),
            purchaseMapper,
            purchaseId.toString()
        ).firstOrNull()

    private fun replaceCollectionItems(ownerId: UUID, collectionId: UUID, items: List<CollectionItemInput>) {
        val bookmarkIds = items.map { parseUuid(it.bookmarkId, "BOOKMARK_ID_INVALID") }
        if (bookmarkIds.distinct().size != bookmarkIds.size) {
            throw ApiException(HttpStatus.CONFLICT, "COLLECTION_ITEM_DUPLICATE", "Collection cannot contain duplicate bookmarks")
        }
        bookmarkIds.forEach { ensureBookmarkOwned(ownerId, it) }

        jdbcTemplate.update("DELETE FROM collection_items WHERE collection_id = ?::uuid", collectionId.toString())
        items.forEachIndexed { index, item ->
            jdbcTemplate.update(
                """
                INSERT INTO collection_items (collection_id, bookmark_id, position, note)
                VALUES (?::uuid, ?::uuid, ?, ?)
                """.trimIndent(),
                collectionId.toString(),
                bookmarkIds[index].toString(),
                index,
                item.note?.trim()?.takeIf { it.isNotBlank() }
            )
        }
    }

    private fun ensureBookmarkOwned(ownerId: UUID, bookmarkId: UUID) {
        val exists = jdbcTemplate.queryForObject(
            """
            SELECT EXISTS (
              SELECT 1 FROM bookmarks
              WHERE user_id = ?::uuid AND id = ?::uuid AND deleted_at IS NULL
            )
            """.trimIndent(),
            Boolean::class.java,
            ownerId.toString(),
            bookmarkId.toString()
        ) ?: false
        if (!exists) {
            throw ApiException(HttpStatus.NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found")
        }
    }

    private fun loadCollectionItems(collectionId: UUID): List<CollectionItemDto> =
        jdbcTemplate.query(
            """
            SELECT
              ci.id AS collection_item_id,
              ci.position AS collection_item_position,
              ci.note AS collection_item_note,
              ${BookmarkRepository.bookmarkSelectColumns()}
            FROM collection_items ci
            JOIN bookmarks b ON b.id = ci.bookmark_id
            LEFT JOIN bookmark_metadata bm ON bm.bookmark_id = b.id
            LEFT JOIN categories c ON c.id = b.category_id
            WHERE ci.collection_id = ?::uuid AND b.deleted_at IS NULL
            ORDER BY ci.position ASC, ci.id ASC
            """.trimIndent(),
            { rs, rowNum ->
                CollectionItemDto(
                    id = rs.getObject("collection_item_id", UUID::class.java).toString(),
                    position = rs.getInt("collection_item_position"),
                    note = rs.getString("collection_item_note"),
                    bookmark = BookmarkRepository.bookmarkMapper.mapRow(rs, rowNum)
                        ?: throw IllegalStateException("Bookmark mapper returned null")
                )
            },
            collectionId.toString()
        )

    private fun nextListingVersion(listingId: UUID): Int =
        jdbcTemplate.queryForObject(
            "SELECT COALESCE(max(version), 0) + 1 FROM listing_versions WHERE listing_id = ?::uuid",
            Int::class.java,
            listingId.toString()
        ) ?: 1

    private fun latestVersion(listingId: UUID): ListingVersionDto? =
        jdbcTemplate.query(
            """
            SELECT ${listingVersionColumns()}
            FROM listing_versions lv
            WHERE lv.listing_id = ?::uuid
            ORDER BY lv.version DESC
            LIMIT 1
            """.trimIndent(),
            listingVersionMapper,
            listingId.toString()
        ).firstOrNull()

    private fun hasActiveGrant(userId: UUID, listingVersionId: UUID): Boolean =
        jdbcTemplate.queryForObject(
            """
            SELECT EXISTS (
              SELECT 1 FROM access_grants
              WHERE user_id = ?::uuid AND listing_version_id = ?::uuid AND revoked_at IS NULL
            )
            """.trimIndent(),
            Boolean::class.java,
            userId.toString(),
            listingVersionId.toString()
        ) ?: false

    private fun listingSnapshot(collection: CollectionDto): Map<String, Any?> =
        mapOf(
            "collectionId" to collection.id,
            "title" to collection.title,
            "description" to collection.description,
            "visibility" to collection.visibility,
            "items" to collection.items.map { item ->
                mapOf(
                    "bookmarkId" to item.bookmark.id,
                    "position" to item.position,
                    "note" to item.note,
                    "url" to item.bookmark.url,
                    "title" to item.bookmark.title,
                    "description" to item.bookmark.description,
                    "faviconUrl" to item.bookmark.faviconUrl
                )
            }
        )

    private fun normalizeTitle(value: String): String {
        val title = value.trim()
        if (title.isBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "TITLE_REQUIRED", "Title is required")
        }
        return title
    }

    private fun normalizeVisibility(value: String): String {
        val visibility = value.trim().uppercase()
        if (visibility !in setOf("PRIVATE", "PUBLIC", "UNLISTED")) {
            throw ApiException(HttpStatus.BAD_REQUEST, "COLLECTION_VISIBILITY_INVALID", "Collection visibility is invalid")
        }
        return visibility
    }

    private fun normalizeCurrency(value: String): String {
        val currency = value.trim().uppercase()
        if (!currency.matches(Regex("^[A-Z]{3}$"))) {
            throw ApiException(HttpStatus.BAD_REQUEST, "CURRENCY_INVALID", "Currency must be a three-letter ISO code")
        }
        return currency
    }

    private fun normalizeSlug(value: String): String {
        val slug = value.trim().lowercase().replace(Regex("[^a-z0-9-]+"), "-").trim('-')
        if (slug.isBlank()) {
            throw ApiException(HttpStatus.BAD_REQUEST, "LISTING_SLUG_INVALID", "Listing slug is invalid")
        }
        return slug
    }

    private fun slugWithId(title: String, listingId: UUID): String =
        "${normalizeSlug(title)}-${listingId.toString().take(8)}"

    private fun parseUuid(value: String, code: String): UUID =
        value.toUuidOrNull() ?: throw ApiException(HttpStatus.BAD_REQUEST, code, "Invalid id")

    private fun String.toUuidOrNull(): UUID? =
        try {
            UUID.fromString(this)
        } catch (exception: IllegalArgumentException) {
            null
        }

    private data class CollectionRow(
        val id: UUID,
        val title: String,
        val description: String?,
        val visibility: String,
        val createdAt: Instant,
        val updatedAt: Instant
    ) {
        fun toDto(items: List<CollectionItemDto>): CollectionDto =
            CollectionDto(
                id = id.toString(),
                title = title,
                description = description,
                visibility = visibility,
                items = items,
                createdAt = createdAt,
                updatedAt = updatedAt
            )
    }

    private val collectionRowMapper = RowMapper { rs: ResultSet, _: Int ->
        CollectionRow(
            id = rs.getObject("id", UUID::class.java),
            title = rs.getString("title"),
            description = rs.getString("description"),
            visibility = rs.getString("visibility"),
            createdAt = rs.getTimestamp("created_at").toInstant(),
            updatedAt = rs.getTimestamp("updated_at").toInstant()
        )
    }

    private fun listingColumns(): String =
        """
        ml.id,
        ml.seller_user_id,
        ml.collection_id,
        ml.status::text AS status,
        ml.slug,
        ml.title,
        ml.description,
        ml.price_cents,
        ml.currency,
        (
          SELECT max(lv.version)
          FROM listing_versions lv
          WHERE lv.listing_id = ml.id
        ) AS latest_version,
        ml.published_at,
        ml.created_at,
        ml.updated_at
        """.trimIndent()

    private val listingMapper = RowMapper { rs: ResultSet, _: Int ->
        val latestVersionValue = rs.getInt("latest_version")
        val latestVersion = if (rs.wasNull()) null else latestVersionValue
        ListingDto(
            id = rs.getObject("id", UUID::class.java).toString(),
            sellerUserId = rs.getObject("seller_user_id", UUID::class.java).toString(),
            collectionId = rs.getObject("collection_id", UUID::class.java).toString(),
            status = rs.getString("status"),
            slug = rs.getString("slug"),
            title = rs.getString("title"),
            description = rs.getString("description"),
            priceCents = rs.getInt("price_cents"),
            currency = rs.getString("currency"),
            latestVersion = latestVersion,
            publishedAt = rs.getTimestamp("published_at")?.toInstant(),
            createdAt = rs.getTimestamp("created_at").toInstant(),
            updatedAt = rs.getTimestamp("updated_at").toInstant()
        )
    }

    private fun listingVersionColumns(): String =
        """
        lv.id,
        lv.listing_id,
        lv.version,
        lv.collection_id,
        lv.snapshot::text AS snapshot,
        lv.price_cents,
        lv.currency,
        lv.created_at
        """.trimIndent()

    private val listingVersionMapper = RowMapper { rs: ResultSet, _: Int ->
        ListingVersionDto(
            id = rs.getObject("id", UUID::class.java).toString(),
            listingId = rs.getObject("listing_id", UUID::class.java).toString(),
            version = rs.getInt("version"),
            collectionId = rs.getObject("collection_id", UUID::class.java).toString(),
            snapshot = objectMapper.readValue(rs.getString("snapshot"), object : TypeReference<Map<String, Any?>>() {}),
            priceCents = rs.getInt("price_cents"),
            currency = rs.getString("currency"),
            createdAt = rs.getTimestamp("created_at").toInstant()
        )
    }

    private fun purchaseColumns(): String =
        """
        p.id,
        p.buyer_user_id,
        p.listing_id,
        p.listing_version_id,
        p.status::text AS status,
        p.amount_cents,
        p.currency,
        p.purchased_at,
        p.created_at
        """.trimIndent()

    private val purchaseMapper = RowMapper { rs: ResultSet, _: Int ->
        PurchaseDto(
            id = rs.getObject("id", UUID::class.java).toString(),
            buyerUserId = rs.getObject("buyer_user_id", UUID::class.java).toString(),
            listingId = rs.getObject("listing_id", UUID::class.java).toString(),
            listingVersionId = rs.getObject("listing_version_id", UUID::class.java).toString(),
            status = rs.getString("status"),
            amountCents = rs.getInt("amount_cents"),
            currency = rs.getString("currency"),
            purchasedAt = rs.getTimestamp("purchased_at")?.toInstant(),
            createdAt = rs.getTimestamp("created_at").toInstant()
        )
    }

    private fun grantColumns(): String =
        """
        ag.id,
        ag.user_id,
        ag.listing_version_id,
        ag.purchase_id,
        ag.source::text AS source,
        ag.expires_at,
        ag.revoked_at,
        ag.created_at
        """.trimIndent()

    private val grantMapper = RowMapper { rs: ResultSet, _: Int ->
        AccessGrantDto(
            id = rs.getObject("id", UUID::class.java).toString(),
            userId = rs.getObject("user_id", UUID::class.java).toString(),
            listingVersionId = rs.getObject("listing_version_id", UUID::class.java).toString(),
            purchaseId = rs.getObject("purchase_id", UUID::class.java)?.toString(),
            source = rs.getString("source"),
            expiresAt = rs.getTimestamp("expires_at")?.toInstant(),
            revokedAt = rs.getTimestamp("revoked_at")?.toInstant(),
            createdAt = rs.getTimestamp("created_at").toInstant()
        )
    }
}
