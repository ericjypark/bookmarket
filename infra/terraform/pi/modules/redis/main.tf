resource "kubernetes_service_v1" "redis" {
  metadata {
    name      = "redis"
    namespace = var.namespace
  }

  spec {
    selector = {
      app = "redis"
    }

    port {
      name        = "redis"
      port        = 6379
      target_port = 6379
    }
  }
}

resource "kubernetes_stateful_set_v1" "redis" {
  metadata {
    name      = "redis"
    namespace = var.namespace
  }

  spec {
    service_name = kubernetes_service_v1.redis.metadata[0].name
    replicas     = 1

    selector {
      match_labels = {
        app = "redis"
      }
    }

    template {
      metadata {
        labels = {
          app = "redis"
        }
      }

      spec {
        enable_service_links = false

        container {
          name    = "redis"
          image   = "redis:7.4-alpine"
          command = ["redis-server", "--appendonly", "yes"]

          port {
            container_port = 6379
            name           = "redis"
          }

          resources {
            requests = {
              cpu    = "50m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "250m"
              memory = "256Mi"
            }
          }

          readiness_probe {
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
          }

          liveness_probe {
            exec {
              command = ["redis-cli", "ping"]
            }
            initial_delay_seconds = 15
            period_seconds        = 20
          }

          volume_mount {
            name       = "redis-data"
            mount_path = "/data"
          }
        }
      }
    }

    volume_claim_template {
      metadata {
        name = "redis-data"
      }

      spec {
        access_modes       = ["ReadWriteOnce"]
        storage_class_name = var.storage_class_name

        resources {
          requests = {
            storage = "1Gi"
          }
        }
      }
    }
  }
}
