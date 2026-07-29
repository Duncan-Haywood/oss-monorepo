resource "helm_release" "gitea_runner" {
  depends_on = [helm_release.gitea]

  name       = "gitea-act-runner"
  repository = "https://dl.gitea.com/charts/"
  chart      = "actions"
  namespace  = kubernetes_namespace.git_system.metadata[0].name
  version    = "0.1.2"

  values = [
    yamlencode({
      gitea = {
        url = "http://gitea-http.git-system.svc.cluster.local:3000"
      }
    })
  ]
}
