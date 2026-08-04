# Tailscale Zero-Trust Cluster Subnet Router & Operator Integration
resource "kubernetes_namespace" "tailscale" {
  metadata {
    name = "tailscale"
  }
}

resource "kubernetes_secret" "tailscale_auth" {
  metadata {
    name      = "tailscale-auth"
    namespace = kubernetes_namespace.tailscale.metadata[0].name
  }

  data = {
    TS_AUTHKEY = "tskey-auth-kfufUtJSG711CNTRL-y3XDB2ZrKZfjiDVfv7ESZfNMEERgBWmGa"
  }

  type = "Opaque"
}

resource "kubernetes_deployment" "tailscale_subnet_router" {
  depends_on = [kubernetes_namespace.tailscale, kubernetes_secret.tailscale_auth]

  metadata {
    name      = "tailscale-subnet-router"
    namespace = kubernetes_namespace.tailscale.metadata[0].name
    labels = {
      app = "tailscale-router"
    }
  }

  spec {
    replicas = 1

    selector {
      match_labels = {
        app = "tailscale-router"
      }
    }

    template {
      metadata {
        labels = {
          app = "tailscale-router"
        }
      }

      spec {
        container {
          name  = "tailscale"
          image = "tailscale/tailscale:stable"

          env {
            name = "TS_AUTHKEY"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.tailscale_auth.metadata[0].name
                key  = "TS_AUTHKEY"
              }
            }
          }

          env {
            name  = "TS_ROUTES"
            value = "10.42.0.0/16"
          }

          env {
            name  = "TS_EXTRA_ARGS"
            value = "--snat-subnet-routes=false --accept-routes"
          }

          security_context {
            capabilities {
              add = ["NET_ADMIN"]
            }
          }
        }
      }
    }
  }
}
