resource "kubernetes_namespace" "argocd" {
  metadata {
    name = "argocd"
  }
}

resource "helm_release" "argocd" {
  depends_on = [helm_release.cert_manager, kubernetes_namespace.argocd]

  name       = "argo-cd"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argo-cd"
  namespace  = kubernetes_namespace.argocd.metadata[0].name
  version    = "6.11.1"

  values = [
    yamlencode({
      server = {
        ingress = {
          enabled          = true
          ingressClassName = "traefik"
          hosts            = ["argocd.marisstella.dev"]
          annotations = {
            "cert-manager.io/cluster-issuer"                   = "letsencrypt-prod"
            "traefik.ingress.kubernetes.io/router.entrypoints" = "web,websecure"
            "traefik.ingress.kubernetes.io/router.middlewares" = "monitoring-admin-auth@kubernetescrd,kube-system-security-headers@kubernetescrd"
          }
        }
      }
    })
  ]
}

output "argocd_url" {
  value       = "https://argocd.marisstella.dev"
  description = "ArgoCD GitOps Dashboard URL"
}
