# Import the two live servers. Names, types, and location must match the
# console or the next apply will want to replace them — which this stack
# must never do.

import {
  to = hcloud_server.control_plane
  id = local.control_plane.id
}

import {
  to = hcloud_server.agent
  id = local.agent.id
}

data "hcloud_placement_group" "hel1" {
  name = "placement-group-1"
}

resource "hcloud_server" "control_plane" {
  name               = local.control_plane.name
  server_type        = local.control_plane.server_type
  location           = local.location
  image              = "ubuntu-24.04"
  backups            = local.control_plane.backups
  placement_group_id = data.hcloud_placement_group.hel1.id

  labels = {
    role    = "control-plane"
    cluster = "hel1-k3s"
    managed = "opentofu"
  }

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  firewall_ids = compact([
    try(data.hcloud_firewall.cluster.id, null),
  ])

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      image,
      ssh_keys,
      user_data,
      # Hetzner may show a more specific image id than ubuntu-24.04.
    ]
  }
}

resource "hcloud_server" "agent" {
  name               = local.agent.name
  server_type        = local.agent.server_type
  location           = local.location
  image              = "ubuntu-24.04"
  backups            = local.agent.backups
  placement_group_id = data.hcloud_placement_group.hel1.id

  labels = {
    role    = "agents"
    cluster = "hel1-k3s"
    managed = "opentofu"
  }

  public_net {
    ipv4_enabled = true
    ipv6_enabled = true
  }

  firewall_ids = compact([
    try(data.hcloud_firewall.cluster.id, null),
  ])

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      image,
      ssh_keys,
      user_data,
    ]
  }
}

data "hcloud_volume" "control_plane" {
  count = var.volume_id == "" ? 0 : 1
  id    = var.volume_id
}
