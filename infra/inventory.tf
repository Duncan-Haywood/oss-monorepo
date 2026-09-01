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
  #
  # This range is NOT free to pick without checking k3s: 10.42.0.0/16 is
  # k3s's own default --cluster-cidr (the pod overlay network), a fact this
  # repo's own gitops/ci/networkpolicy.yaml comment states outright ("k3s
  # defaults: pods 10.42.0.0/16, services 10.43.0.0/16"). This physical
  # private network claims the exact same block, with both nodes' advertise
  # addresses sitting inside it — a node's own address landing inside the
  # range flannel hands out to its local pods produces two routes for one
  # prefix in the same table, and the kernel keeps only one.
  #
  # bootstrap/install-k3s-server.sh now pins --cluster-cidr away from this
  # block so a *future* fresh/DR install cannot recreate the collision;
  # infra/tests/test_infra_layout.py pins the two do not overlap. It cannot
  # fix a cluster already running with k3s's default cluster-cidr baked in
  # from its original install — that needs a full k3s reinstall or SSH-level
  # surgery this repo's automation has no access to. It has not shown up as
  # a visible failure yet because every workload with public consequence is
  # pinned to the control-plane node alone (see priority-classes.yaml) and
  # the governor that would put Jobs on the second node is still disabled,
  # so no cross-node pod traffic has ever had to cross it.
  private_network_cidr = "10.42.0.0/16"
  private_subnet_cidr  = "10.42.0.0/24"
  control_plane_priv   = "10.42.0.10"
  agent_priv           = "10.42.0.11"

  gitops_repo     = var.gitops_repo_url
  gitops_revision = var.gitops_revision
  argocd_version  = var.argocd_version
}
