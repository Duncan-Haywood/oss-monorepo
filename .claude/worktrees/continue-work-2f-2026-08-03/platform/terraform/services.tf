resource "kubernetes_namespace" "web_services" {
  metadata {
    name = "web-services"
  }
}

resource "helm_release" "web_service" {
  # Pairwise is reconciled by Argo CD from the gitops-production branch.
  # Before applying this ownership change to an existing cluster, detach the
  # old release from state without uninstalling its live objects:
  # terraform state rm 'helm_release.web_service["quick-pick-survey"]'
  for_each = {
    for name, service in var.services : name => service
    if name != "quick-pick-survey"
  }
  depends_on = [helm_release.cert_manager, kubernetes_namespace.web_services]

  name      = each.key
  chart     = "${path.module}/helm/web-service"
  namespace = kubernetes_namespace.web_services.metadata[0].name

  values = [
    yamlencode({
      replicas = each.value.replicas
      image = {
        # Pairwise releases are built by Gitea Actions and pulled from Gitea's
        # registry. Never restore the obsolete node-local image name.
        repository = each.key == "quick-pick-survey" ? "git.marisstella.dev/giteaadmin/pairwise-app" : each.value.image
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
