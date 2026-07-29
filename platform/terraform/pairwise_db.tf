# Dedicated PostgreSQL Database for Pairwise Engine
variable "pairwise_db_password" {
  type        = string
  sensitive   = true
  description = "Password for the Pairwise PostgreSQL role"

  validation {
    condition     = length(var.pairwise_db_password) >= 20
    error_message = "pairwise_db_password must be at least 20 characters."
  }
}

resource "kubernetes_deployment" "pairwise_db" {
  metadata {
    name      = "pairwise-db"
    namespace = "web-services"
  }

  spec {
    replicas = 1
    strategy {
      type = "Recreate"
    }

    selector {
      match_labels = {
        app = "pairwise-db"
      }
    }

    template {
      metadata {
        labels = {
          app = "pairwise-db"
        }
      }

      spec {
        container {
          name  = "postgres"
          image = "postgres:16-alpine"

          security_context {
            allow_privilege_escalation = false
            capabilities {
              drop = ["ALL"]
            }
          }

          env {
            name  = "POSTGRES_DB"
            value = "pairwise"
          }
          env {
            name  = "POSTGRES_USER"
            value = "postgres"
          }
          env {
            name = "POSTGRES_PASSWORD"
            value_from {
              secret_key_ref {
                name = kubernetes_secret.pairwise_db_secret.metadata[0].name
                key  = "password"
              }
            }
          }

          port {
            container_port = 5432
          }

          readiness_probe {
            exec {
              command = ["pg_isready", "-U", "postgres", "-d", "pairwise"]
            }
            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 6
          }

          liveness_probe {
            exec {
              command = ["pg_isready", "-U", "postgres", "-d", "pairwise"]
            }
            initial_delay_seconds = 30
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 6
          }

          resources {
            requests = {
              cpu    = "100m"
              memory = "256Mi"
            }
            limits = {
              cpu    = "1"
              memory = "1Gi"
            }
          }

          volume_mount {
            name       = "db-data"
            mount_path = "/var/lib/postgresql/data"
          }
        }

        volume {
          name = "db-data"
          persistent_volume_claim {
            claim_name = kubernetes_persistent_volume_claim.pairwise_db_pvc.metadata[0].name
          }
        }
      }
    }
  }
}

resource "kubernetes_secret" "pairwise_db_secret" {
  metadata {
    name      = "pairwise-db-secret"
    namespace = "web-services"
  }

  data = {
    password = var.pairwise_db_password
  }

  type = "Opaque"
}

resource "kubernetes_persistent_volume_claim" "pairwise_db_pvc" {
  wait_until_bound = false

  metadata {
    name      = "pairwise-db-pvc"
    namespace = "web-services"
  }

  spec {
    access_modes       = ["ReadWriteOnce"]
    storage_class_name = "local-path"
    resources {
      requests = {
        storage = "10Gi"
      }
    }
  }

  lifecycle {
    # The database volume must survive Terraform destroy and refactors. Removing
    # it requires temporarily deleting this guard as an explicit break-glass act.
    prevent_destroy = true
  }
}

resource "kubernetes_service" "pairwise_db_service" {
  metadata {
    name      = "pairwise-db"
    namespace = "web-services"
  }

  spec {
    selector = {
      app = "pairwise-db"
    }

    port {
      port        = 5432
      target_port = 5432
    }
  }
}
