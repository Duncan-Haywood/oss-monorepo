variable "grafana_admin_password" {
  type        = string
  sensitive   = true
  description = "Grafana administrator password supplied by the protected deployment environment"

  validation {
    condition     = length(var.grafana_admin_password) >= 20
    error_message = "grafana_admin_password must be at least 20 characters."
  }
}

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
  }
}

# 1. Prometheus + Grafana Stack
resource "helm_release" "kube_prometheus_stack" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.monitoring]

  name       = "kube-prometheus-stack"
  repository = "https://prometheus-community.github.io/helm-charts"
  chart      = "kube-prometheus-stack"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = "60.0.0"

  values = [
    yamlencode({
      grafana = {
        adminPassword = var.grafana_admin_password
        ingress = {
          enabled          = true
          ingressClassName = "traefik"
          hosts            = ["monitoring.marisstella.dev"]
          annotations = {
            "cert-manager.io/cluster-issuer"                   = "letsencrypt-prod"
            "traefik.ingress.kubernetes.io/router.entrypoints" = "web,websecure"
          }
        }
      }
      prometheus = {
        prometheusSpec = {
          resources = {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "500m"
              memory = "512Mi"
            }
          }
        }
      }
    })
  ]
}

# 2. Loki + Promtail Log Aggregator
resource "helm_release" "loki_stack" {
  depends_on = [helm_release.kube_prometheus_stack]

  name       = "loki-stack"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "loki-stack"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  version    = "2.10.2"

  values = [
    yamlencode({
      loki = {
        enabled = true
        persistence = {
          enabled          = true
          storageClassName = "local-path"
          size             = "10Gi"
        }
      }
      promtail = {
        enabled = true
      }
    })
  ]
}

output "grafana_url" {
  value       = "http://monitoring.marisstella.dev"
  description = "Grafana & Loki Monitoring Dashboard URL"
}
