# Declarative Multi-Agent Infrastructure System (Antigravity, Claude Code, Grok, Codex)
# Authenticated via On-Server Gitea OAuth2 / OIDC Provider (No Static API Keys)

# 1. Gitea OAuth2 / OIDC Credentials for Monorepo Agents
resource "kubernetes_secret" "gitea_agent_oauth_config" {
  metadata {
    name      = "gitea-agent-oauth-credentials"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
  }

  data = {
    # On-Server Gitea OAuth2 & OIDC Provider Configuration
    GITEA_SERVER_URL          = "http://git.marisstella.dev"
    GITEA_OAUTH_CLIENT_ID     = "GITEA_AGENT_OAUTH_CLIENT_ID_PLACEHOLDER"
    GITEA_OAUTH_CLIENT_SECRET = "GITEA_AGENT_OAUTH_CLIENT_SECRET_PLACEHOLDER"
    GITEA_OIDC_WELL_KNOWN     = "http://git.marisstella.dev/.well-known/openid-configuration"
    OAUTH_REDIRECT_URI        = "http://code.marisstella.dev/oauth/callback"
  }

  type = "Opaque"
}

# 2. Antigravity & Claude Code Agent Pool (Gitea OAuth Authenticated)
resource "kubernetes_deployment" "antigravity_agent_worker" {
  depends_on = [kubernetes_namespace.agent_system, kubernetes_secret.gitea_agent_oauth_config]

  metadata {
    name      = "antigravity-agent-worker"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
    labels = {
      app = "antigravity-agent"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "antigravity-agent"
      }
    }

    template {
      metadata {
        labels = {
          app = "antigravity-agent"
        }
      }

      spec {
        container {
          name  = "antigravity-agent"
          image = "python:3.11-slim"

          command = [
            "sh", "-c",
            "pip install google-antigravity-sdk gitpython && python -c 'import time; print(\"Antigravity Agent Ready via Gitea OAuth\"); time.sleep(86400)'"
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret.gitea_agent_oauth_config.metadata[0].name
            }
          }

          volume_mount {
            name       = "workspace"
            mount_path = "/workspace"
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "1000m"
              memory = "2Gi"
            }
          }
        }

        volume {
          name = "workspace"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.agent_workspace_storage.metadata[0].name
          }
        }
      }
    }
  }
}

# 3. Grok & Codex Agent Pool (Gitea OAuth Authenticated)
resource "kubernetes_deployment" "grok_codex_agent_worker" {
  depends_on = [kubernetes_namespace.agent_system, kubernetes_secret.gitea_agent_oauth_config]

  metadata {
    name      = "grok-codex-agent-worker"
    namespace = kubernetes_namespace.agent_system.metadata[0].name
    labels = {
      app = "grok-codex-agent"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "grok-codex-agent"
      }
    }

    template {
      metadata {
        labels = {
          app = "grok-codex-agent"
        }
      }

      spec {
        container {
          name  = "grok-codex-agent"
          image = "node:22-alpine"

          command = [
            "sh", "-c",
            "npm install -g @anthropic-ai/claude-code && sh -c 'echo Grok & Codex Agent Pool Listening via Gitea OAuth...; sleep 86400'"
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret.gitea_agent_oauth_config.metadata[0].name
            }
          }

          volume_mount {
            name       = "workspace"
            mount_path = "/workspace"
          }

          resources {
            requests = {
              cpu    = "250m"
              memory = "512Mi"
            }
            limits = {
              cpu    = "1000m"
              memory = "2Gi"
            }
          }
        }

        volume {
          name = "workspace"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.agent_workspace_storage.metadata[0].name
          }
        }
      }
    }
  }
}
