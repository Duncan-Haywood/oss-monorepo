resource "kubernetes_namespace" "web_services" {
  metadata {
    name = "web-services"
  }
}

resource "helm_release" "web_service" {
  for_each   = var.services
  depends_on = [helm_release.cert_manager, kubernetes_namespace.web_services]

  name      = each.key
  chart     = "${path.module}/helm/web-service"
  namespace = kubernetes_namespace.web_services.metadata[0].name

  values = [
    yamlencode({
      replicas = each.value.replicas
      image = {
        repository = each.value.image
        tag        = each.value.tag
      }
      imagePullSecrets = each.key == "quick-pick-survey" ? [
        { name = "pairwise-registry" }
      ] : []
      service = {
        port       = each.value.port
        targetPort = each.value.port
      }
      ingress = {
        enabled       = true
        host          = each.value.domain
        className     = "traefik"
        clusterIssuer = "letsencrypt-prod"
      }
      env = each.value.env
      probes = each.key == "quick-pick-survey" ? {
        livenessPath  = "/api/health"
        readinessPath = "/api/health/ready"
        } : {
        livenessPath  = "/"
        readinessPath = "/"
      }
    })
  ]
}

output "deployed_services" {
  value = {
    for name, config in var.services : name => "http://${config.domain}"
  }
  description = "List of deployed web application URLs"
}
