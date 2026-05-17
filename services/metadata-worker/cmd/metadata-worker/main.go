package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"time"

	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/config"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/fetcher"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/health"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/store"
	"github.com/eric-jy-park/bookmarket-v2/services/metadata-worker/internal/worker"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("metadata worker config failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", health.Handler)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	go func() {
		log.Printf("metadata worker listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("metadata worker failed: %v", err)
		}
	}()

	var metadataWorker *worker.Worker
	if cfg.Enabled {
		metadataStore, err := store.Open(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Fatalf("metadata worker store failed: %v", err)
		}
		defer metadataStore.Close()

		metadataWorker = worker.New(cfg, fetcher.NewWithHostResolveOverrides(cfg.HTTPTimeout, cfg.HostResolveOverrides), metadataStore)
		defer metadataWorker.Close()

		go metadataWorker.Run(ctx)
		log.Printf(
			"metadata worker consuming topic=%s publishing topic=%s dlq=%s brokers=%v",
			cfg.MetadataJobsTopic,
			cfg.MetadataEventsTopic,
			cfg.MetadataJobsDLQTopic,
			cfg.KafkaBrokers,
		)
	} else {
		log.Printf("metadata worker consumer disabled")
	}

	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("metadata worker shutdown failed: %v", err)
	}
}
