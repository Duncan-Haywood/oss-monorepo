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
      # DinD and Next.js/BuildKit share the node's inotify pool. Ubuntu's
      # default of 128 instances is exhausted by parallel Actions jobs, which
      # causes docker.sock context cancellations after otherwise-successful
      # builds. This privileged init runs on every runner start and persists
      # the required node-level capacity across runner rollouts.
      postExtraInitContainers = [{
        name    = "raise-inotify-limits"
        image   = "busybox:1.38.0"
        command = ["sh", "-c", "sysctl -w fs.inotify.max_user_instances=1024 fs.inotify.max_user_watches=524288 fs.inotify.max_queued_events=32768"]
        securityContext = {
          privileged = true
        }
      }]
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
