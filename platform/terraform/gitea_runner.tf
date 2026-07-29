resource "helm_release" "gitea_runner" {
  depends_on = [helm_release.gitea]

  name       = "gitea-act-runner"
  repository = "https://dl.gitea.com/charts/"
  chart      = "actions"
  namespace  = kubernetes_namespace.git_system.metadata[0].name
  version    = "0.1.2"

  values = [
    yamlencode({
      enabled           = true
      existingSecret    = "gitea-runner-registration"
      existingSecretKey = "token"
      giteaRootURL      = "http://gitea-http.git-system.svc.cluster.local:3000"
      statefulset = {
        replicas = 2
        runner = {
          resources = {
            requests = {
              cpu    = "100m"
              memory = "128Mi"
            }
            limits = {
              cpu    = "1000m"
              memory = "1Gi"
            }
          }
        }
        dind = {
          resources = {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "2000m"
              memory = "2Gi"
            }
          }
        }
      }
    })
  ]
}
