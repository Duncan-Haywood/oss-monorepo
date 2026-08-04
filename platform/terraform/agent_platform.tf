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

# Until 2026-08-04 both code-server releases in this configuration were pinned at
# the literal `"latest"`, on public Traefik ingresses (`code.marisstella.dev` and
# `opencode.marisstella.dev`). A code-server is a remote shell: `:latest` means
# the running build cannot be named, a rollback has no target, and an upstream
# push lands on a public shell without a diff. `platform/terraform/` was read by
# no control at all, so nothing said so.
#
# There is no default here on purpose. A tag this configuration does not know is
# a `terraform plan` failure, not a silent float, and the validation refuses any
# value that is not immutable evidence — the same rule
# `scripts/ci/image_tags.py:is_immutable_tag` applies to every other surface.
# Supply it as `TF_VAR_code_server_image_tag`.
variable "code_server_image_tag" {
  type        = string
  description = "Immutable codercom/code-server release: a digest, or a version tag such as 4.x.y"

  validation {
    condition = can(regex(
      "^(sha256:[0-9a-f]{64}|v?[0-9]+(\\.[0-9]+)*([-_.+][A-Za-z0-9][A-Za-z0-9._+-]*)?)$",
      var.code_server_image_tag
    ))
    error_message = "code_server_image_tag must name one specific release (a digest or a version); :latest, :stable and friends name a moving target."
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
        tag        = var.code_server_image_tag
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
