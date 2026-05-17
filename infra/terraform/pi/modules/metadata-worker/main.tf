resource "kubernetes_service_v1" "metadata_worker" {
  metadata {
    name      = "metadata-worker"
    namespace = var.namespace
  }

  spec {
    selector = {
      app = "metadata-worker"
    }

    port {
      name        = "http"
      port        = 8081
      target_port = 8081
    }
  }
}

resource "kubernetes_deployment_v1" "metadata_worker" {
  metadata {
    name      = "metadata-worker"
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
        app = "metadata-worker"
      }
    }

    template {
      metadata {
        labels = {
          app = "metadata-worker"
        }
      }

      spec {
        enable_service_links = false

        container {
          name  = "metadata-worker"
          image = var.image

          port {
            name           = "http"
            container_port = 8081
          }

          env {
            name  = "KAFKA_BOOTSTRAP_SERVERS"
            value = "${var.kafka_service}:9092"
          }
          env {
            name  = "METADATA_JOBS_TOPIC"
            value = "metadata.jobs"
          }
          env {
            name  = "METADATA_EVENTS_TOPIC"
            value = "metadata.events"
          }
          env {
            name  = "METADATA_JOBS_DLQ_TOPIC"
            value = "metadata.jobs.dlq"
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
            name  = "METADATA_WORKER_HTTP_TIMEOUT_SECONDS"
            value = "8"
          }
          env {
            name  = "METADATA_WORKER_MAX_ATTEMPTS"
            value = "3"
          }
          env {
            name  = "METADATA_WORKER_RETRY_INITIAL_BACKOFF_MS"
            value = "250"
          }
          env {
            name  = "METADATA_WORKER_HOST_RESOLVE_OVERRIDES"
            value = var.host_resolve_overrides
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "256Mi"
            }
          }

          readiness_probe {
            http_get {
              path = "/health"
              port = 8081
            }
            initial_delay_seconds = 10
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/health"
              port = 8081
            }
            initial_delay_seconds = 30
            period_seconds        = 20
          }
        }
      }
    }
  }
}
