# Traefik Basic Auth Security Middleware for Internal Admin Tools
variable "admin_basic_auth_users" {
  type        = string
  sensitive   = true
  description = "htpasswd-formatted users entry supplied by the deployment secret store"

  validation {
    condition     = can(regex("^[^:]+:\\$", var.admin_basic_auth_users))
    error_message = "admin_basic_auth_users must be a valid htpasswd-formatted entry."
  }
}

resource "kubernetes_manifest" "admin_basic_auth" {
  manifest = {
    apiVersion = "traefik.io/v1alpha1"
    kind       = "Middleware"
    metadata = {
      name      = "admin-auth"
      namespace = "monitoring"
    }
    spec = {
      basicAuth = {
        secret = "admin-credentials-secret"
      }
    }
  }
}

resource "kubernetes_secret" "admin_credentials_secret" {
  metadata {
    name      = "admin-credentials-secret"
    namespace = "monitoring"
  }

  data = {
    users = var.admin_basic_auth_users
  }

  type = "Opaque"
}
