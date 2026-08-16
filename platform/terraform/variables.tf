variable "hcloud_token" {
  type        = string
  sensitive   = true
  description = "Hetzner Cloud API Token for managing servers, volumes, and load balancers"
}

variable "kubeconfig_path" {
  type        = string
  default     = "~/.kube/config"
  description = "Path to the local kubeconfig file connected to the Hetzner K3s cluster"
}

variable "server_ip" {
  type        = string
  default     = "89.167.29.39"
  description = "Hetzner server IP address"
}

variable "letsencrypt_email" {
  type        = string
  default     = "admin@example.com"
  description = "Email address for Let's Encrypt SSL certificate registration"
}

variable "services" {
  type = map(object({
    domain = string
    image  = string
    # `tag` is required on purpose, and was `optional(string, "latest")` until
    # 2026-08-04. That default was the tag every service which forgot to declare
    # one actually shipped on: `services.tf` feeds it straight into the
    # `helm/web-service` chart, so a floating reference was the silent outcome
    # of an omission rather than of a decision. A service with no tag must now
    # fail `terraform plan` — loudly, at review time — instead of floating.
    tag      = string
    replicas = optional(number, 2)
    port     = optional(number, 80)
    env      = optional(map(string), {})
  }))
  description = "Declarative map of all web services hosted on the Hetzner cluster"
  default     = {}

  # Added 2026-08-16. Requiring `tag` stopped an *omission* from floating; it
  # said nothing about the value, so `tag = "latest"` was accepted here as
  # readily as a digest and `IMG-008` recorded that this file carried no
  # `validation` block at all. Every entry in this map becomes a public TLS
  # ingress through `helm_release.web_service`, and the tag is the only record
  # of what is answering on that hostname — a moving reference means the running
  # build cannot be named and a rollback has no target.
  #
  # The condition is the same rule `code_server_image_tag` uses in
  # `agent_platform.tf` and `scripts/ci/image_tags.py:is_immutable_tag` applies
  # to every other surface: a `sha256:` digest, or a version. `alltrue` over the
  # whole map rather than a spot check — a validation that reads one service is
  # a validation the second service escapes. An empty map passes, which is what
  # `default = {}` means: no services, nothing to float.
  validation {
    condition = alltrue([
      for name, service in var.services :
      can(regex("^(sha256:[0-9a-f]{64}|v?[0-9]+(\\.[0-9]+)*([-_.+][A-Za-z0-9][A-Za-z0-9._+-]*)?)$", service.tag))
    ])
    error_message = "Every services[*].tag must name one specific build — a sha256: digest or a version such as 1.4.2. `latest`, `stable` and friends name a moving target on a public ingress."
  }
}

variable "primary_node_type" {
  type        = string
  default     = "cpx31"
  description = "Hetzner server type for primary control plane node"
}

variable "secondary_node_type" {
  type        = string
  default     = "cpx11"
  description = "Hetzner server type for secondary HA worker node"
}

variable "enable_secondary_worker_node" {
  type        = bool
  default     = true
  description = "Enable secondary worker node for high availability and failover"
}

variable "node_location" {
  type        = string
  default     = "hel1"
  description = "Hetzner cloud datacenter location (Helsinki)"
}

variable "node_autoscaling_min" {
  type        = number
  default     = 2
  description = "Minimum number of nodes in horizontal autoscaling pool"
}

variable "node_autoscaling_max" {
  type        = number
  default     = 5
  description = "Maximum number of nodes in horizontal autoscaling pool"
}
