resource "helm_release" "cert_manager" {
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  namespace        = "cert-manager"
  create_namespace = true
  version          = "v1.15.1"

  set {
    name  = "installCRDs"
    value = "true"
  }
}

# ClusterIssuers managed cleanly via Helm
resource "helm_release" "cluster_issuers" {
  depends_on = [helm_release.cert_manager]

  name             = "cluster-issuers"
  chart            = "${path.module}/helm/cluster-issuers"
  namespace        = "cert-manager"
  create_namespace = false

  set {
    name  = "email"
    value = var.letsencrypt_email
  }
}
