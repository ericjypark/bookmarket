# syntax=docker/dockerfile:1.7

FROM golang:1.25-alpine AS builder
WORKDIR /workspace/services/metadata-worker

COPY services/metadata-worker/go.mod services/metadata-worker/go.sum ./
RUN go mod download

COPY services/metadata-worker ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/metadata-worker ./cmd/metadata-worker

FROM alpine:3.21 AS runner
RUN adduser -D -H bookmarket

COPY --from=builder /out/metadata-worker /usr/local/bin/metadata-worker

USER bookmarket
EXPOSE 8081

ENTRYPOINT ["metadata-worker"]
