resource "kubernetes_service_v1" "web" {
  metadata {
    name      = "web"
    namespace = var.namespace
  }

  spec {
    selector = {
      app = "web"
    }

    port {
      name        = "http"
      port        = 3000
      target_port = 3000
    }
  }
}

resource "kubernetes_deployment_v1" "web" {
  metadata {
    name      = "web"
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
        app = "web"
      }
    }

    template {
      metadata {
        labels = {
          app = "web"
        }
      }

      spec {
        enable_service_links = false

        container {
          name  = "web"
          image = var.image

          port {
            name           = "http"
            container_port = 3000
          }

          env {
            name  = "BOOKMARKET_API_BASE_URL"
            value = "http://${var.api_service_name}:8080"
          }
          env {
            name  = "NEXT_PUBLIC_API_BASE_URL"
            value = "http://${var.api_service_name}:8080"
          }
          env {
            name  = "NEXT_PUBLIC_DOMAIN"
            value = var.domain
          }
          env {
            name  = "BOOKMARKET_COOKIE_DOMAIN"
            value = var.domain
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
            name  = "NEXT_PUBLIC_GITHUB_REDIRECT_URI"
            value = "https://${var.domain}/oauth/github"
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }

          readiness_probe {
            http_get {
              path = "/"
              port = 3000
            }
            initial_delay_seconds = 10
            period_seconds        = 10
          }

          liveness_probe {
            http_get {
              path = "/"
              port = 3000
            }
            initial_delay_seconds = 30
            period_seconds        = 20
          }
        }
      }
    }
  }
}
