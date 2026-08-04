resource "kubernetes_namespace" "git_system" {
  metadata {
    name = "git-system"
  }
}

variable "gitea_admin_password" {
  type        = string
  sensitive   = true
  description = "Initial Gitea administrator password supplied by the deployment secret store"

  validation {
    condition     = length(var.gitea_admin_password) >= 20
    error_message = "gitea_admin_password must be at least 20 characters."
  }
}

resource "helm_release" "gitea" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.git_system]

  name       = "gitea"
  repository = "https://dl.gitea.com/charts/"
  chart      = "gitea"
  namespace  = kubernetes_namespace.git_system.metadata[0].name
  version    = "10.4.0"

  values = [
    yamlencode({
      # Disable heavy HA subcharts
      postgresql = {
        enabled = false
      }
      "postgresql-ha" = {
        enabled = false
      }
      redis = {
        enabled = false
      }
      "redis-cluster" = {
        enabled = false
      }

      gitea = {
        admin = {
          username = "giteaadmin"
          password = var.gitea_admin_password
          email    = "admin@hetzner-git.local"
        }
        config = {
          APP_NAME = "Private AI Agent Git & CI Engine"
          RUN_MODE = "prod"
          database = {
            DB_TYPE = "sqlite3"
            PATH    = "/data/gitea/gitea.db"
          }
          server = {
            DOMAIN          = "git.marisstella.dev"
            ROOT_URL        = "https://git.marisstella.dev/"
            HTTP_PORT       = 3000
            DISABLE_SSH     = false
            SSH_PORT        = 2222
            SSH_LISTEN_PORT = 2222
          }
          service = {
            DISABLE_REGISTRATION = true
            REQUIRE_SIGNIN_VIEW  = true
            ENABLE_CAPTCHA       = true
          }
          picture = {
            DISABLE_GRAVATAR        = true
            ENABLE_FEDERATED_AVATAR = false
          }
          actions = {
            ENABLED = true
          }
          packages = {
            ENABLED = true
          }
        }
      }
      ingress = {
        enabled   = true
        className = "traefik"
        hosts = [
          {
            host = "git.marisstella.dev"
            paths = [
              {
                path     = "/"
                pathType = "Prefix"
              }
            ]
          }
        ]
        tls = [
          {
            secretName = "gitea-tls"
            hosts      = ["git.marisstella.dev"]
          }
        ]
        annotations = {
          "cert-manager.io/cluster-issuer"                   = "letsencrypt-prod"
          "traefik.ingress.kubernetes.io/router.entrypoints" = "web,websecure"
        }
      }
      persistence = {
        enabled      = true
        storageClass = "local-path"
        size         = "20Gi"
      }
      resources = {
        requests = {
          cpu    = "100m"
          memory = "128Mi"
        }
        limits = {
          cpu    = "1000m"
          memory = "512Mi"
        }
      }
    })
  ]
}

output "gitea_url" {
  value       = "https://git.marisstella.dev"
  description = "Gitea Git & CI Engine URL"
}
