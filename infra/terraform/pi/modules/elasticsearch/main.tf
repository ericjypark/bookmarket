resource "kubernetes_service_v1" "elasticsearch" {
  metadata {
    name      = "elasticsearch"
    namespace = var.namespace
  }

  spec {
    selector = {
      app = "elasticsearch"
    }

    port {
      name        = "http"
      port        = 9200
      target_port = 9200
    }
  }
}

resource "kubernetes_stateful_set_v1" "elasticsearch" {
  metadata {
    name      = "elasticsearch"
    namespace = var.namespace
  }

  spec {
    service_name = kubernetes_service_v1.elasticsearch.metadata[0].name
    replicas     = 1

    selector {
      match_labels = {
        app = "elasticsearch"
      }
    }

    template {
      metadata {
        labels = {
          app = "elasticsearch"
        }
      }

      spec {
        enable_service_links = false

        container {
          name  = "elasticsearch"
          image = "docker.elastic.co/elasticsearch/elasticsearch:8.17.1"

          port {
            name           = "http"
            container_port = 9200
          }

          env {
            name  = "discovery.type"
            value = "single-node"
          }
          env {
            name  = "xpack.security.enabled"
            value = "false"
          }
          env {
            name  = "ES_JAVA_OPTS"
            value = "-Xms512m -Xmx512m"
          }
          env {
            name  = "_JAVA_OPTIONS"
            value = "-XX:UseSVE=0"
          }

          resources {
            requests = {
              cpu    = "500m"
              memory = "1536Mi"
            }
            limits = {
              cpu    = "1500m"
              memory = "2Gi"
            }
          }

          readiness_probe {
            http_get {
              path = "/_cluster/health?wait_for_status=yellow&timeout=5s"
              port = 9200
            }
            initial_delay_seconds = 30
            period_seconds        = 15
            timeout_seconds       = 10
          }

          liveness_probe {
            http_get {
              path = "/"
              port = 9200
            }
            initial_delay_seconds = 60
            period_seconds        = 30
          }

          volume_mount {
            name       = "elasticsearch-data"
            mount_path = "/usr/share/elasticsearch/data"
          }
        }
      }
    }

    volume_claim_template {
      metadata {
        name = "elasticsearch-data"
      }

      spec {
        access_modes       = ["ReadWriteOnce"]
        storage_class_name = var.storage_class_name

        resources {
          requests = {
            storage = "8Gi"
          }
        }
      }
    }
  }
}
