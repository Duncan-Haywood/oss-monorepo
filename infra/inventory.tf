# Adopted Hetzner inventory — these machines already exist.
# OpenTofu imports them; it must not create a third box or replace these two.
#
#   cpx52  #163417666  ubuntu-24gb-hel1-1   89.167.29.39     hel1
#   cpx22  #163580094  ubuntu-4gb-hel1-1    157.180.80.188   hel1
#
# Firewall `k3s-cluster-firewall` is already applied to both.
# marisstella.dev A/@ and A/* already point at the cpx52.

locals {
  location     = "hel1"
  network_zone = "eu-central"

  control_plane = {
    id           = "163417666"
    name         = "ubuntu-24gb-hel1-1"
    server_type  = "cpx52"
    ipv4         = "89.167.29.39"
    ipv6_network = "2a01:4f9:c014:d275::/64"
    backups      = true
    role         = "control-plane"
  }

  agent = {
    id           = "163580094"
    name         = "ubuntu-4gb-hel1-1"
    server_type  = "cpx22"
    ipv4         = "157.180.80.188"
    ipv6_network = "2a01:4f9:c015:5556::/64"
    backups      = false
    role         = "agents"
  }

  # Private fabric for k3s join traffic so 6443 does not have to stay
  # world-open. Created by this stack; servers are attached in place.
  private_network_cidr = "10.42.0.0/16"
  private_subnet_cidr  = "10.42.0.0/24"
  control_plane_priv   = "10.42.0.10"
  agent_priv           = "10.42.0.11"

  gitops_repo     = var.gitops_repo_url
  gitops_revision = var.gitops_revision
  argocd_version  = var.argocd_version
}
