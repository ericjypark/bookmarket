package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                 string
	Enabled              bool
	KafkaBrokers         []string
	MetadataJobsTopic    string
	MetadataEventsTopic  string
	MetadataJobsDLQTopic string
	ConsumerGroup        string
	HTTPTimeout          time.Duration
	MaxAttempts          int
	RetryInitialBackoff  time.Duration
	DatabaseURL          string
}

func Load() (Config, error) {
	timeoutSeconds, err := intEnv("METADATA_WORKER_HTTP_TIMEOUT_SECONDS", 8)
	if err != nil {
		return Config{}, err
	}
	maxAttempts, err := intEnv("METADATA_WORKER_MAX_ATTEMPTS", 3)
	if err != nil {
		return Config{}, err
	}
	retryBackoffMillis, err := intEnv("METADATA_WORKER_RETRY_INITIAL_BACKOFF_MS", 250)
	if err != nil {
		return Config{}, err
	}

	metadataJobsTopic := firstNonEmpty(os.Getenv("METADATA_JOBS_TOPIC"), "metadata.jobs")

	return Config{
		Port:                 firstNonEmpty(os.Getenv("METADATA_WORKER_PORT"), os.Getenv("PORT"), "8081"),
		Enabled:              boolEnv("METADATA_WORKER_ENABLED", true),
		KafkaBrokers:         splitCSV(firstNonEmpty(os.Getenv("KAFKA_BOOTSTRAP_SERVERS"), os.Getenv("KAFKA_BROKERS"), "localhost:9092")),
		MetadataJobsTopic:    metadataJobsTopic,
		MetadataEventsTopic:  firstNonEmpty(os.Getenv("METADATA_EVENTS_TOPIC"), "metadata.events"),
		MetadataJobsDLQTopic: firstNonEmpty(os.Getenv("METADATA_JOBS_DLQ_TOPIC"), metadataJobsTopic+".dlq"),
		ConsumerGroup:        firstNonEmpty(os.Getenv("METADATA_WORKER_CONSUMER_GROUP"), "bookmarket-metadata-worker"),
		HTTPTimeout:          time.Duration(timeoutSeconds) * time.Second,
		MaxAttempts:          maxAttempts,
		RetryInitialBackoff:  time.Duration(retryBackoffMillis) * time.Millisecond,
		DatabaseURL:          databaseURL(),
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	brokers := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			brokers = append(brokers, trimmed)
		}
	}
	return brokers
}

func boolEnv(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func intEnv(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer: %w", name, err)
	}
	if parsed <= 0 {
		return 0, fmt.Errorf("%s must be positive", name)
	}
	return parsed, nil
}

func databaseURL() string {
	if value := firstNonEmpty(os.Getenv("DATABASE_URL"), os.Getenv("BOOKMARKET_DATABASE_URL")); value != "" {
		return value
	}

	host := firstNonEmpty(os.Getenv("POSTGRES_HOST"), "localhost")
	port := firstNonEmpty(os.Getenv("POSTGRES_PORT"), "5432")
	db := firstNonEmpty(os.Getenv("POSTGRES_DB"), "bookmarket")
	user := firstNonEmpty(os.Getenv("POSTGRES_USER"), "bookmarket")
	password := firstNonEmpty(os.Getenv("POSTGRES_PASSWORD"), "bookmarket")
	databaseURL := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(user, password),
		Host:   fmt.Sprintf("%s:%s", host, port),
		Path:   db,
	}
	query := databaseURL.Query()
	query.Set("sslmode", "disable")
	databaseURL.RawQuery = query.Encode()
	return databaseURL.String()
}
