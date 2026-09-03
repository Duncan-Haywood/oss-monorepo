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
  # NOT 10.42.0.0/16, which is what this block said until 2026-09-01.
  #
  # 10.42.0.0/16 is k3s's *default `--cluster-cidr`* -- the pod network --
  # and nothing in bootstrap/install-k3s-server.sh overrides it. So the
  # planned private network was the pod network, address for address, and
  # the two node IPs sat inside it:
  #
  #   flannel gives the first node the pod subnet 10.42.0.0/24 and puts
  #   10.42.0.1/24 on cni0. The private NIC would have carried
  #   10.42.0.10/24 on the same box -- two interfaces, one subnet, two
  #   routes. Worse, pod IPs are handed out of that same /24, so the first
  #   dozen pods scheduled on the control plane would eventually be issued
  #   10.42.0.10 and 10.42.0.11: the addresses `--node-ip`,
  #   `--advertise-address`, `--tls-san` and the agent's `SERVER_URL` all
  #   name. A pod would answer to the API server's address.
  #
  # This was never applied -- `create_private_network` defaults to true but
  # `infra/Makefile` refuses to apply, and the only Hetzner token in the
  # repo is read-only, so no `hcloud_network` exists to migrate. The cost of
  # fixing it is this comment and four strings. The cost of fixing it after
  # a `tofu apply` is renumbering a live cluster's node addresses on the box
  # that serves marisstella.dev.
  #
  # 10.10.0.0/16 is clear of both k3s defaults (pods 10.42/16, services
  # 10.43/16), of Docker's default bridge pool (172.17-172.31), and of the
  # 192.168/16 a laptop on a home LAN sits in. Changing it means also adding
  # the new range to the `except:` lists in gitops/*/networkpolicy.yaml --
  # those blocked the node IPs only as a side effect of excluding the pod
  # CIDR, so moving the network without moving the exception would open pods
  # a route to the kubelet. gitops/tests asserts the new range is there.
  # #2660 fixed the same collision from the other end, concurrently with
  # this: bootstrap/install-k3s-server.sh now pins `--cluster-cidr` to
  # 10.244.0.0/16 so a fresh or DR install cannot recreate it. Both changes
  # are kept, and they are not redundant -- they cover different clusters:
  #
  #   the pin  protects a cluster installed from now on, and cannot touch
  #            one already running, whose --cluster-cidr was baked in at
  #            install time. #2660 says so itself.
  #   this     protects the cluster that exists. The thing being created
  #            here is the *network*, not the cluster, so moving it to
  #            10.10.0.0/16 lands clear of a live pod network still on
  #            k3s's 10.42.0.0/16 default -- the case the pin explicitly
  #            could not reach.
  #
  # Which is why the range below stays clear of BOTH 10.42/16 and
  # 10.244/16: whichever pod CIDR a given cluster ended up with, this
  # network does not overlap it.
  private_network_cidr = "10.10.0.0/16"
  private_subnet_cidr  = "10.10.0.0/24"
  control_plane_priv   = "10.10.0.10"
  agent_priv           = "10.10.0.11"

  gitops_repo     = var.gitops_repo_url
  gitops_revision = var.gitops_revision
  argocd_version  = var.argocd_version
}
