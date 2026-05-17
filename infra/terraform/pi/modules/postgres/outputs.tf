output "service_name" {
  value = kubernetes_service_v1.postgres.metadata[0].name
}
