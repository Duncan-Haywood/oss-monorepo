variable "gitops_repo_url" {
  type        = string
  description = "HTTPS URL Argo CD pulls. Public anonymous clone, or a deploy-key Secret after bootstrap."
  default     = "https://github.com/Duncan-Haywood/monorepo-projects.git"
}

variable "gitops_revision" {
  type        = string
  description = "Git ref Argo tracks. Stay on main; agents open PRs, they do not push here."
  default     = "main"
}

variable "argocd_version" {
  type        = string
  description = "Pinned Argo CD manifest tag used by bootstrap/install-argocd.sh."
  default     = "v3.5.1"
}

variable "k3s_channel" {
  type        = string
  description = "k3s install channel (get.k3s.io INSTALL_K3S_CHANNEL)."
  default     = "stable"
}

variable "expose_k3s_api_publicly" {
  type        = bool
  description = "Keep TCP/6443 open to the world, matching the current k3s-cluster-firewall. Set false only after the private network is up and both nodes join over 10.42.0.10."
  default     = true
}

variable "ssh_allowed_cidrs" {
  type        = list(string)
  description = "CIDRs allowed to hit SSH. Default matches the current firewall (anywhere). Tighten when you have a stable admin IP."
  default     = ["0.0.0.0/0", "::/0"]
}

variable "create_private_network" {
  type        = bool
  description = "Create and attach a Hetzner private network. Safe on live servers (hot-add). Required before closing public 6443."
  default     = true
}

variable "volume_id" {
  type        = string
  description = "Existing 100 GiB volume already attached to the cpx52. Empty = do not manage it yet. Fill from infra/scripts/discover.sh."
  default     = ""
}

variable "firewall_id" {
  type        = string
  description = "Existing k3s-cluster-firewall ID. Empty = look up by name (data source) and do not take over the resource until imported."
  default     = ""
}

variable "run_bootstrap" {
  type        = bool
  description = "If true, remote-exec the bootstrap scripts over SSH. Off by default — first apply from a laptop you control, never from an agent Job."
  default     = false
}

variable "ssh_private_key_path" {
  type        = string
  description = "Local private key for optional remote-exec. Never committed. Only used when run_bootstrap is true."
  default     = ""
  sensitive   = true
}
