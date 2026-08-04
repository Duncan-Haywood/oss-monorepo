# Bitnami SealedSecrets Controller for Zero-Setup Secret Encryption
resource "helm_release" "sealed_secrets" {
  depends_on = [helm_release.cert_manager]

  name       = "sealed-secrets"
  repository = "https://bitnami-labs.github.io/sealed-secrets"
  chart      = "sealed-secrets"
  namespace  = "kube-system"
  version    = "2.14.2"

  values = [
    yamlencode({
      fullnameOverride = "sealed-secrets-controller"
      keyrenewperiod   = "720h" # 30 days
      resources = {
        requests = {
          cpu    = "50m"
          memory = "64Mi"
        }
        limits = {
          cpu    = "200m"
          memory = "128Mi"
        }
      }
    })
  ]
}

output "sealed_secrets_controller_name" {
  value       = "sealed-secrets-controller"
  description = "Name of the Bitnami SealedSecrets controller in kube-system"
}
