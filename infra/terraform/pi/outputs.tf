output "namespace" {
  value = module.namespace.name
}

output "web_service_name" {
  value = module.web.service_name
}

output "api_service_name" {
  value = module.api.service_name
}
