# 1. Kubernetes Metrics Server for HPA Resource Monitoring
resource "helm_release" "metrics_server" {
  name             = "metrics-server"
  repository       = "https://kubernetes-sigs.github.io/metrics-server/"
  chart            = "metrics-server"
  namespace        = "kube-system"
  create_namespace = false
  version          = "3.12.1"

  set {
    name  = "args[0]"
    value = "--kubelet-insecure-tls" # Required for K3s local certs
  }
}

# 2. Horizontal Pod Autoscaler for Pairwise Application
resource "kubernetes_horizontal_pod_autoscaler_v2" "pairwise_hpa" {
  depends_on = [helm_release.metrics_server, helm_release.web_service]

  metadata {
    name      = "pairwise-hpa"
    namespace = "web-services"
  }

  spec {
    # Keep two ready replicas so a node loss and a rolling update do not
    # collapse the service to a single point of failure.
    min_replicas = 2
    # Prisma maintains a pool per process. Bound scaling so app replicas cannot
    # consume every PostgreSQL connection and lock out backups or migrations.
    max_replicas = 4

    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = "quick-pick-survey-web-service"
    }

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }

    # Memory is intentionally excluded: Pairwise has a stable per-process
    # baseline, so adding replicas does not lower utilization and previously
    # drove this HPA to its maximum continuously.
  }
}

# 3. Horizontal Pod Autoscaler for Maris Stella Labs Homepage
resource "kubernetes_horizontal_pod_autoscaler_v2" "homepage_hpa" {
  depends_on = [helm_release.metrics_server, helm_release.web_service]

  metadata {
    name      = "homepage-hpa"
    namespace = "web-services"
  }

  spec {
    min_replicas = 2
    max_replicas = 10

    scale_target_ref {
      api_version = "apps/v1"
      kind        = "Deployment"
      name        = "web-portal-web-service"
    }

    metric {
      type = "Resource"
      resource {
        name = "cpu"
        target {
          type                = "Utilization"
          average_utilization = 70
        }
      }
    }
  }
}
