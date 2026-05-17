package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/events"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/fetcher"
	"github.com/jackc/pgx/v5/pgconn"
	_ "github.com/jackc/pgx/v5/stdlib"
)

const consumerName = "services/metadata-worker"

type Store struct {
	db *sql.DB
}

func Open(ctx context.Context, databaseURL string) (*Store, error) {
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) ApplyCompleted(
	ctx context.Context,
	request events.Envelope,
	payload events.MetadataFetchRequestedPayload,
	result fetcher.Result,
) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer rollbackUnlessCommitted(tx)

	processed, err := recordProcessedEvent(ctx, tx, request)
	if err != nil || !processed {
		return processed, err
	}

	_, err = tx.ExecContext(
		ctx,
		`
		UPDATE bookmark_metadata
		SET status = 'READY'::metadata_status,
		    title = NULLIF($3, ''),
		    description = NULLIF($4, ''),
		    favicon_url = NULLIF($5, ''),
		    canonical_url = NULLIF($6, ''),
		    failure_code = NULL,
		    failure_message = NULL,
		    fetched_at = $7,
		    updated_at = now()
		WHERE bookmark_id = $1::uuid
		  AND version = $2
		`,
		payload.BookmarkID,
		payload.MetadataVersion,
		result.Title,
		result.Description,
		result.FaviconURL,
		result.CanonicalURL,
		result.FetchedAt,
	)
	if err != nil {
		return false, err
	}

	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) ApplyFailed(
	ctx context.Context,
	request events.Envelope,
	payload events.MetadataFetchRequestedPayload,
	code string,
	message string,
	retryable bool,
) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer rollbackUnlessCommitted(tx)

	processed, err := recordProcessedEvent(ctx, tx, request)
	if err != nil || !processed {
		return processed, err
	}

	_, err = tx.ExecContext(
		ctx,
		`
		UPDATE bookmark_metadata
		SET status = 'FAILED'::metadata_status,
		    failure_code = $3,
		    failure_message = $4,
		    fetched_at = now(),
		    updated_at = now()
		WHERE bookmark_id = $1::uuid
		  AND version = $2
		`,
		payload.BookmarkID,
		payload.MetadataVersion,
		code,
		truncate(message, 500),
	)
	if err != nil {
		return false, err
	}
	_ = retryable

	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func recordProcessedEvent(ctx context.Context, tx *sql.Tx, request events.Envelope) (bool, error) {
	_, err := tx.ExecContext(
		ctx,
		`
		INSERT INTO processed_events (event_id, idempotency_key, consumer)
		VALUES ($1::uuid, $2, $3)
		`,
		request.EventID,
		request.IdempotencyKey,
		consumerName,
	)
	if err == nil {
		return true, nil
	}

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return false, nil
	}
	return false, fmt.Errorf("record processed event: %w", err)
}

func rollbackUnlessCommitted(tx *sql.Tx) {
	_ = tx.Rollback()
}

func truncate(value string, maxLen int) string {
	if len(value) <= maxLen {
		return value
	}
	return value[:maxLen]
}
