# Unified Production Service Portal Dashboard
resource "kubernetes_namespace" "portal_system" {
  metadata {
    name = "portal-system"
  }
}

resource "helm_release" "cluster_dashboard" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.portal_system]

  name      = "cluster-portal"
  chart     = "${path.module}/helm/web-service"
  namespace = kubernetes_namespace.portal_system.metadata[0].name

  values = [
    yamlencode({
      replicas = 1
      image = {
        repository = "nginxdemos/hello"
        tag        = "plain-text"
      }
      service = {
        port       = 80
        targetPort = 80
      }
      ingress = {
        enabled       = true
        host          = "dashboard.marisstella.dev"
        className     = "traefik"
        clusterIssuer = "letsencrypt-prod"
      }
    })
  ]
}

output "cluster_portal_url" {
  value       = "http://dashboard.marisstella.dev"
  description = "Unified Production Service Portal & Dashboard URL"
}
