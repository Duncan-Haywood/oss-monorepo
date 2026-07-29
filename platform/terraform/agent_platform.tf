# AI Coding Agent Infrastructure & Web IDE Environment
variable "code_server_password" {
  type        = string
  sensitive   = true
  description = "Code Server password supplied by the protected Gitea Actions secret store"

  validation {
    condition     = length(var.code_server_password) >= 20
    error_message = "code_server_password must be at least 20 characters."
  }
}

resource "kubernetes_namespace" "agent_system" {
  metadata {
    name = "agent-system"
  }
}

# 1. Persistent Storage for AI Agent Workspaces & Build Caches (npm/pip/go)
resource "kubernetes_persistent_volume_claim" "agent_workspace_storage" {
  wait_until_bound = false

  metadata {
    name      = "agent-workspace-pvc"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
  }
  spec {
    access_modes       = ["ReadWriteOnce"]
    storage_class_name = "local-path"
    resources {
      requests = {
        storage = "50Gi"
      }
    }
  }
}

# 2. Secret Vault for AI Agent API Keys & Tokens
resource "kubernetes_secret" "agent_credentials" {
  metadata {
    name      = "agent-credentials"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
  }

  data = {
    HCLOUD_TOKEN = var.hcloud_token
  }

  type = "Opaque"
}

# 3. Web-based VS Code IDE (code-server) for remote agent inspection & dev
resource "helm_release" "code_server" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.agent_system]

  name      = "code-server"
  chart     = "${path.module}/helm/web-service"
  namespace = kubernetes_namespace.agent_system.metadata[0].name

  values = [
    yamlencode({
      replicas = 1
      image = {
        repository = "codercom/code-server"
        tag        = "latest"
      }
      service = {
        port       = 8080
        targetPort = 8080
      }
      ingress = {
        enabled       = true
        host          = "code.marisstella.dev"
        className     = "traefik"
        clusterIssuer = "letsencrypt-prod"
      }
      env = {
        PASSWORD = var.code_server_password
      }
    })
  ]
}

# 4. In-Cluster Redis Task Queue & Memory Cache for AI Coding Agents
resource "helm_release" "agent_redis" {
  depends_on = [kubernetes_namespace.agent_system]

  name      = "agent-redis"
  chart     = "${path.module}/helm/web-service"
  namespace = kubernetes_namespace.agent_system.metadata[0].name

  values = [
    yamlencode({
      replicas = 1
      image = {
        repository = "redis"
        tag        = "7-alpine"
      }
      service = {
        port       = 6379
        targetPort = 6379
      }
      ingress = {
        enabled = false
      }
    })
  ]
}

output "agent_redis_host" {
  value       = "agent-redis-web-service.agent-system.svc.cluster.local:6379"
  description = "Internal K3s DNS hostname for AI Agent Redis Task Queue & Cache"
}

output "code_server_url" {
  value       = "http://code.marisstella.dev"
  description = "Web-based VS Code IDE for AI Coding Agents & Remote Dev"
}
