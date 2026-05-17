output "service_name" {
  value = kubernetes_service_v1.redis.metadata[0].name
}
