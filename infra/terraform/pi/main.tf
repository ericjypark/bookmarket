module "namespace" {
  source = "./modules/namespace"

  name = var.namespace
}

module "postgres" {
  source = "./modules/postgres"

  namespace          = module.namespace.name
  storage_class_name = var.storage_class_name
  secret_name        = var.app_secret_name
}

module "redis" {
  source = "./modules/redis"

  namespace          = module.namespace.name
  storage_class_name = var.storage_class_name
}

module "kafka" {
  source = "./modules/kafka"

  namespace          = module.namespace.name
  storage_class_name = var.storage_class_name
}

module "elasticsearch" {
  source = "./modules/elasticsearch"

  namespace          = module.namespace.name
  storage_class_name = var.storage_class_name
}

module "api" {
  source = "./modules/api"

  namespace         = module.namespace.name
  image             = var.api_image
  app_secret_name   = var.app_secret_name
  postgres_service  = module.postgres.service_name
  redis_service     = module.redis.service_name
  kafka_service     = module.kafka.service_name
  elasticsearch_url = "http://${module.elasticsearch.service_name}:9200"
}

module "metadata_worker" {
  source = "./modules/metadata-worker"

  namespace              = module.namespace.name
  image                  = var.metadata_worker_image
  kafka_service          = module.kafka.service_name
  postgres_service       = module.postgres.service_name
  app_secret_name        = var.app_secret_name
  host_resolve_overrides = var.metadata_worker_host_resolve_overrides
}

module "web" {
  source = "./modules/web"

  namespace        = module.namespace.name
  image            = var.web_image
  api_service_name = module.api.service_name
  app_secret_name  = var.app_secret_name
  domain           = var.domain
}

module "ingress" {
  source = "./modules/ingress"

  namespace           = module.namespace.name
  domain              = var.domain
  api_host            = var.api_host
  web_tls_secret_name = var.web_tls_secret_name
  api_tls_secret_name = var.api_tls_secret_name
  web_service_name    = module.web.service_name
  api_service_name    = module.api.service_name
}
