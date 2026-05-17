resource "kubernetes_service_v1" "api" {
  metadata {
    name      = "api"
    namespace = var.namespace
  }

  spec {
    selector = {
      app = "api"
    }

    port {
      name        = "http"
      port        = 8080
      target_port = 8080
    }
  }
}

resource "kubernetes_deployment_v1" "api" {
  metadata {
    name      = "api"
    namespace = var.namespace
  }

  lifecycle {
    ignore_changes = [
      spec[0].template[0].metadata[0].annotations["kubectl.kubernetes.io/restartedAt"]
    ]
  }

  spec {
    replicas = 1

    strategy {
      type = "RollingUpdate"
      rolling_update {
        max_surge       = "1"
        max_unavailable = "0"
      }
    }

    selector {
      match_labels = {
        app = "api"
      }
    }

    template {
      metadata {
        labels = {
          app = "api"
        }
      }

      spec {
        enable_service_links = false

        container {
          name  = "api"
          image = var.image

          port {
            name           = "http"
            container_port = 8080
          }

          env {
            name  = "POSTGRES_HOST"
            value = var.postgres_service
          }
          env {
            name  = "POSTGRES_PORT"
            value = "5432"
          }
          env {
            name  = "POSTGRES_DB"
            value = "bookmarket"
          }
          env {
            name  = "BOOKMARKET_FLYWAY_ENABLED"
            value = "true"
          }
          env {
            name = "POSTGRES_USER"
            value_from {
              secret_key_ref {
                name = var.app_secret_name
                key  = "database-user"
              }
            }
          }
          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = var.app_secret_name
                key  = "database-password"
              }
            }
          }
          env {
            name  = "REDIS_URL"
            value = "redis://${var.redis_service}:6379"
          }
          env {
            name  = "BOOKMARKET_REDIS_ENABLED"
            value = "true"
          }
          env {
            name  = "KAFKA_BOOTSTRAP_SERVERS"
            value = "${var.kafka_service}:9092"
          }
          env {
            name  = "BOOKMARKET_KAFKA_ENABLED"
            value = "true"
          }
          env {
            name  = "BOOKMARKET_KAFKA_BOOKMARK_EVENTS_TOPIC"
            value = "bookmark.events"
          }
          env {
            name  = "BOOKMARKET_KAFKA_METADATA_JOBS_TOPIC"
            value = "metadata.jobs"
          }
          env {
            name  = "BOOKMARKET_KAFKA_METADATA_EVENTS_TOPIC"
            value = "metadata.events"
          }
          env {
            name  = "BOOKMARKET_KAFKA_METADATA_EVENTS_CONSUMER_GROUP"
            value = "bookmarket-api-metadata-events"
          }
          env {
            name  = "ELASTICSEARCH_URL"
            value = var.elasticsearch_url
          }
          env {
            name  = "BOOKMARKET_SEARCH_ELASTICSEARCH_ENABLED"
            value = "true"
          }
          env {
            name = "BOOKMARKET_SEARCH_REBUILD_TOKEN"
            value_from {
              secret_key_ref {
                name     = var.app_secret_name
                key      = "search-rebuild-token"
                optional = true
              }
            }
          }
          env {
            name = "BOOKMARKET_AUTH_SECRET"
            value_from {
              secret_key_ref {
                name = var.app_secret_name
                key  = "jwt-secret"
              }
            }
          }
          env {
            name = "NEXT_PUBLIC_GOOGLE_CLIENT_ID"
            value_from {
              secret_key_ref {
                name     = var.app_secret_name
                key      = "google-client-id"
                optional = true
              }
            }
          }
          env {
            name = "GOOGLE_CLIENT_SECRET"
            value_from {
              secret_key_ref {
                name     = var.app_secret_name
                key      = "google-client-secret"
                optional = true
              }
            }
          }
          env {
            name = "NEXT_PUBLIC_GITHUB_CLIENT_ID"
            value_from {
              secret_key_ref {
                name     = var.app_secret_name
                key      = "github-client-id"
                optional = true
              }
            }
          }
          env {
            name = "GITHUB_CLIENT_SECRET"
            value_from {
              secret_key_ref {
                name     = var.app_secret_name
                key      = "github-client-secret"
                optional = true
              }
            }
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "1000m"
              memory = "1Gi"
            }
          }

          readiness_probe {
            http_get {
              path = "/actuator/health/readiness"
              port = 8080
            }
            initial_delay_seconds = 20
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/actuator/health/liveness"
              port = 8080
            }
            initial_delay_seconds = 45
            period_seconds        = 20
          }
        }
      }
    }
  }
}
