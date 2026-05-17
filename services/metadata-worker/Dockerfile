# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /workspace/services/metadata-worker

COPY services/metadata-worker/go.mod services/metadata-worker/go.sum ./
RUN go mod download

COPY services/metadata-worker ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/metadata-worker ./cmd/metadata-worker

FROM alpine:3.21 AS obscura
ARG TARGETARCH
RUN apk add --no-cache curl tar
RUN set -eux; \
    mkdir -p /tmp/obscura /out; \
    case "$TARGETARCH" in \
      amd64) obscura_arch="x86_64-linux" ;; \
      arm64) obscura_arch="" ;; \
      *) echo "unsupported TARGETARCH=$TARGETARCH" >&2; exit 1 ;; \
    esac; \
    if [ -n "$obscura_arch" ]; then \
      curl -fsSL "https://github.com/h4ckf0r0day/obscura/releases/latest/download/obscura-${obscura_arch}.tar.gz" -o /tmp/obscura.tar.gz; \
      tar -xzf /tmp/obscura.tar.gz -C /tmp/obscura; \
      find /tmp/obscura -type f -name obscura -exec cp {} /out/obscura \;; \
      chmod +x /out/obscura; \
    else \
      echo "Obscura does not currently publish a Linux arm64 release archive; building without browser fallback binary."; \
      touch /out/.obscura-linux-arm64-unavailable; \
    fi

FROM ubuntu:22.04 AS runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --no-create-home bookmarket

COPY --from=builder /out/metadata-worker /usr/local/bin/metadata-worker
COPY --from=obscura /out/ /usr/local/bin/

USER bookmarket
EXPOSE 8081

ENTRYPOINT ["metadata-worker"]
