# OpenCode Interpreter & AI Coding Agent Runner for Mimo 2.5 / Mimo 2.5 Pro models
variable "mimo_api_key" {
  type        = string
  sensitive   = true
  default     = "MIMO_API_KEY_PLACEHOLDER"
  description = "API key for Mimo 2.5 / Mimo 2.5 Pro models"
}

variable "mimo_api_base" {
  type        = string
  default     = "https://api.mimo.ai/v1" # Update with your Mimo endpoint if custom
  description = "API endpoint for Mimo models"
}

variable "opencode_password" {
  type        = string
  sensitive   = true
  description = "Administrative password injected into the OpenCode service at deploy time"

  validation {
    condition     = length(var.opencode_password) >= 20
    error_message = "opencode_password must be at least 20 characters."
  }
}

resource "kubernetes_config_map" "opencode_config" {
  metadata {
    name      = "opencode-config"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
  }

  data = {
    "opencode.json" = jsonencode({
      model            = "mimo-2.5-pro"
      fallback_model   = "mimo-2.5"
      api_base         = var.mimo_api_base
      git_author_name  = "OpenCode AI Agent"
      git_author_email = "agent@hetzner-cluster.local"
      auto_commit      = true
      workspace_dir    = "/workspace"
    })
  }
}

# Declarative OpenCode Agent Worker Deployment
resource "helm_release" "opencode_agent" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.agent_system]

  name      = "opencode-agent"
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
        host          = "opencode.marisstella.dev"
        className     = "traefik"
        clusterIssuer = "letsencrypt-prod"
      }
      env = {
        MODEL_NAME    = "mimo-2.5-pro"
        OPENAI_BASE   = var.mimo_api_base
        WORKSPACE_DIR = "/workspace"
        PASSWORD      = var.opencode_password
      }
    })
  ]
}

output "opencode_agent_url" {
  value       = "http://opencode.marisstella.dev"
  description = "OpenCode AI Agent Endpoint configured for Mimo 2.5 / Mimo 2.5 Pro"
}
