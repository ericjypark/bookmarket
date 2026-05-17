variable "namespace" {
  type = string
}

variable "domain" {
  type = string
}

variable "api_host" {
  type = string
}

variable "web_tls_secret_name" {
  type        = string
  description = "TLS secret covering the primary web host and wildcard public-profile subdomains."
}

variable "api_tls_secret_name" {
  type        = string
  description = "TLS secret covering the API host."
}

variable "web_service_name" {
  type = string
}

variable "api_service_name" {
  type = string
}
