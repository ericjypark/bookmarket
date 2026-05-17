output "service_name" {
  value = kubernetes_service_v1.web.metadata[0].name
}
