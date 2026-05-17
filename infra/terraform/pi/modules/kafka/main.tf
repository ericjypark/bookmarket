resource "kubernetes_service_v1" "kafka" {
  metadata {
    name      = "kafka"
    namespace = var.namespace
  }

  spec {
    publish_not_ready_addresses = true

    selector = {
      app = "kafka"
    }

    port {
      name        = "broker"
      port        = 9092
      target_port = 9092
    }

    port {
      name        = "controller"
      port        = 9093
      target_port = 9093
    }
  }
}

resource "kubernetes_stateful_set_v1" "kafka" {
  metadata {
    name      = "kafka"
    namespace = var.namespace
  }

  spec {
    service_name = kubernetes_service_v1.kafka.metadata[0].name
    replicas     = 1

    selector {
      match_labels = {
        app = "kafka"
      }
    }

    template {
      metadata {
        labels = {
          app = "kafka"
        }
      }

      spec {
        enable_service_links = false

        container {
          name  = "kafka"
          image = "confluentinc/cp-kafka:7.9.0"

          port {
            name           = "broker"
            container_port = 9092
          }

          port {
            name           = "controller"
            container_port = 9093
          }

          env {
            name  = "CLUSTER_ID"
            value = "MkU3OEVBNTcwNTJENDM2Qk"
          }
          env {
            name  = "KAFKA_NODE_ID"
            value = "1"
          }
          env {
            name  = "KAFKA_PROCESS_ROLES"
            value = "broker,controller"
          }
          env {
            name  = "KAFKA_CONTROLLER_QUORUM_VOTERS"
            value = "1@127.0.0.1:9093"
          }
          env {
            name  = "KAFKA_LISTENERS"
            value = "PLAINTEXT://:9092,CONTROLLER://:9093"
          }
          env {
            name  = "KAFKA_ADVERTISED_LISTENERS"
            value = "PLAINTEXT://kafka:9092"
          }
          env {
            name  = "KAFKA_LISTENER_SECURITY_PROTOCOL_MAP"
            value = "PLAINTEXT:PLAINTEXT,CONTROLLER:PLAINTEXT"
          }
          env {
            name  = "KAFKA_CONTROLLER_LISTENER_NAMES"
            value = "CONTROLLER"
          }
          env {
            name  = "KAFKA_INTER_BROKER_LISTENER_NAME"
            value = "PLAINTEXT"
          }
          env {
            name  = "KAFKA_AUTO_CREATE_TOPICS_ENABLE"
            value = "false"
          }
          env {
            name  = "KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR"
            value = "1"
          }
          env {
            name  = "KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR"
            value = "1"
          }
          env {
            name  = "KAFKA_TRANSACTION_STATE_LOG_MIN_ISR"
            value = "1"
          }
          env {
            name  = "KAFKA_LOG_DIRS"
            value = "/var/lib/kafka/data"
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "768Mi"
            }
            limits = {
              cpu    = "1000m"
              memory = "1Gi"
            }
          }

          readiness_probe {
            exec {
              command = ["kafka-topics", "--bootstrap-server", "localhost:9092", "--list"]
            }
            initial_delay_seconds = 30
            period_seconds        = 15
            timeout_seconds       = 10
          }

          liveness_probe {
            exec {
              command = ["kafka-topics", "--bootstrap-server", "localhost:9092", "--list"]
            }
            initial_delay_seconds = 60
            period_seconds        = 30
            timeout_seconds       = 10
          }

          volume_mount {
            name       = "kafka-data"
            mount_path = "/var/lib/kafka/data"
          }
        }
      }
    }

    volume_claim_template {
      metadata {
        name = "kafka-data"
      }

      spec {
        access_modes       = ["ReadWriteOnce"]
        storage_class_name = var.storage_class_name

        resources {
          requests = {
            storage = "5Gi"
          }
        }
      }
    }
  }
}

resource "kubernetes_job_v1" "kafka_topics" {
  metadata {
    name      = "kafka-topics-init"
    namespace = var.namespace
  }

  timeouts {
    create = "5m"
  }

  spec {
    backoff_limit = 6

    template {
      metadata {
        labels = {
          app = "kafka-topics-init"
        }
      }

      spec {
        enable_service_links = false
        restart_policy       = "OnFailure"

        container {
          name  = "kafka-topics-init"
          image = "confluentinc/cp-kafka:7.9.0"

          command = [
            "/bin/bash",
            "-ec",
            <<-EOT
              for attempt in {1..60}; do
                if kafka-topics --bootstrap-server kafka:9092 --list >/dev/null 2>&1; then
                  break
                fi
                sleep 5
              done

              for topic in bookmark.events metadata.jobs metadata.events search.jobs bookmark.events.dlq metadata.jobs.dlq metadata.events.dlq search.jobs.dlq; do
                kafka-topics --bootstrap-server kafka:9092 --create --if-not-exists --topic "$topic" --partitions 1 --replication-factor 1
              done
            EOT
          ]

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
        }
      }
    }
  }

  depends_on = [kubernetes_stateful_set_v1.kafka]
}
