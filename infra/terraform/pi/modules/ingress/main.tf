resource "kubernetes_ingress_v1" "web" {
  metadata {
    name      = "web"
    namespace = var.namespace
    annotations = {
      "kubernetes.io/ingress.class" = "traefik"
    }
  }

  spec {
    tls {
      hosts = [
        var.domain,
        "*.${var.domain}"
      ]
      secret_name = var.web_tls_secret_name
    }

    rule {
      host = var.domain

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = var.web_service_name
              port {
                number = 3000
              }
            }
          }
        }
      }
    }

    rule {
      host = "*.${var.domain}"

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = var.web_service_name
              port {
                number = 3000
              }
            }
          }
        }
      }
    }
  }
}

resource "kubernetes_ingress_v1" "api" {
  metadata {
    name      = "api"
    namespace = var.namespace
    annotations = {
      "kubernetes.io/ingress.class" = "traefik"
    }
  }

  spec {
    tls {
      hosts       = [var.api_host]
      secret_name = var.api_tls_secret_name
    }

    rule {
      host = var.api_host

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = var.api_service_name
              port {
                number = 8080
              }
            }
          }
        }
      }
    }
  }
}
