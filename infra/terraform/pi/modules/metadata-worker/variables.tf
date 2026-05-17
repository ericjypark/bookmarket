variable "namespace" {
  type = string
}

variable "image" {
  type = string
}

variable "kafka_service" {
  type = string
}

variable "postgres_service" {
  type = string
}

variable "app_secret_name" {
  type = string
}

variable "host_resolve_overrides" {
  type        = string
  description = "Comma-separated host=ip entries used by the metadata worker for explicitly approved self-hosted domains with broken WAN hairpin routing."
  default     = ""
}
