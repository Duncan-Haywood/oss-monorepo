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
