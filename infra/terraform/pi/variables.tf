variable "kubeconfig_path" {
  type        = string
  description = "Path to the k3s kubeconfig."
  default     = "~/.kube/config"
}

variable "namespace" {
  type        = string
  description = "Kubernetes namespace for Bookmarket."
  default     = "bookmarket"
}

variable "domain" {
  type        = string
  description = "Primary host for the web app."
  default     = "bmkt.example.local"
}

variable "api_host" {
  type        = string
  description = "Host for the API ingress."
  default     = "api.bmkt.example.local"
}

variable "web_tls_secret_name" {
  type        = string
  description = "Kubernetes TLS Secret for the web ingress. It must cover the primary domain and wildcard public-profile subdomains."
  default     = "bookmarket-web-tls"
}

variable "api_tls_secret_name" {
  type        = string
  description = "Kubernetes TLS Secret for the API ingress. It must cover api_host."
  default     = "bookmarket-api-tls"
}

variable "web_image" {
  type        = string
  description = "GHCR-ready ARM64 web image."
  default     = "ghcr.io/eric-jy-park/bookmarket-v2-web:latest"
}

variable "api_image" {
  type        = string
  description = "GHCR-ready ARM64 API image."
  default     = "ghcr.io/eric-jy-park/bookmarket-v2-api:latest"
}

variable "metadata_worker_image" {
  type        = string
  description = "GHCR-ready ARM64 metadata worker image."
  default     = "ghcr.io/eric-jy-park/bookmarket-v2-metadata-worker:latest"
}

variable "app_secret_name" {
  type        = string
  description = "Kubernetes Secret containing app credentials."
  default     = "bookmarket-app-secrets"
}

variable "storage_class_name" {
  type        = string
  description = "Storage class for single-node k3s PVCs."
  default     = "local-path"
}
