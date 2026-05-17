output "service_name" {
  value = kubernetes_service_v1.kafka.metadata[0].name
}
