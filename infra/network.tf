# New private network in eu-central. Hot-attaching to running servers does
# not recreate them. k3s should advertise and join on these addresses so
# the public 6443 rule can go away.

resource "hcloud_network" "cluster" {
  count    = var.create_private_network ? 1 : 0
  name     = "hel1-k3s"
  ip_range = local.private_network_cidr

  labels = {
    cluster = "hel1-k3s"
    managed = "opentofu"
  }
}

resource "hcloud_network_subnet" "cluster" {
  count        = var.create_private_network ? 1 : 0
  network_id   = hcloud_network.cluster[0].id
  type         = "cloud"
  network_zone = local.network_zone
  ip_range     = local.private_subnet_cidr
}

resource "hcloud_server_network" "control_plane" {
  count      = var.create_private_network ? 1 : 0
  server_id  = hcloud_server.control_plane.id
  network_id = hcloud_network.cluster[0].id
  ip         = local.control_plane_priv

  depends_on = [hcloud_network_subnet.cluster]
}

resource "hcloud_server_network" "agent" {
  count      = var.create_private_network ? 1 : 0
  server_id  = hcloud_server.agent.id
  network_id = hcloud_network.cluster[0].id
  ip         = local.agent_priv

  depends_on = [hcloud_network_subnet.cluster]
}
