output "service_name" {
  value = kubernetes_service_v1.metadata_worker.metadata[0].name
}
