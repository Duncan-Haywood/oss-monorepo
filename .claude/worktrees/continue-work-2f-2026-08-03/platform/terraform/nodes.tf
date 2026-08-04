# Hetzner Cloud Infrastructure Node Topology & Node Autoscaling

resource "hcloud_placement_group" "cluster_ha_group" {
  name = "k3s-ha-spread-group"
  type = "spread"

  labels = {
    environment = "production"
    cluster     = "hetzner-web-cluster"
  }
}

# Primary Control Plane / Worker Node
resource "hcloud_server" "primary_node" {
  name               = "hetzner-node-01-primary"
  image              = "ubuntu-24.04"
  server_type        = var.primary_node_type
  location           = var.node_location
  placement_group_id = hcloud_placement_group.cluster_ha_group.id
  backups            = true

  labels = {
    role        = "control-plane"
    environment = "production"
    cluster     = "hetzner-web-cluster"
  }

  lifecycle {
    # This node owns the local-path volumes for stateful workloads. Replacing or
    # destroying it must be an explicit break-glass change after a restore test.
    prevent_destroy = true
  }
}

# Secondary Small Node for High Availability & Fault Isolation
resource "hcloud_server" "secondary_worker_node" {
  count              = var.enable_secondary_worker_node ? 1 : 0
  name               = "hetzner-node-02-secondary"
  image              = "ubuntu-24.04"
  server_type        = var.secondary_node_type
  location           = var.node_location
  placement_group_id = hcloud_placement_group.cluster_ha_group.id

  labels = {
    role         = "worker"
    environment  = "production"
    cluster      = "hetzner-web-cluster"
    ha_secondary = "true"
  }
}

# Node Autoscaling Pool Policy & Limits Configuration
locals {
  node_autoscaling_config = {
    min_nodes      = var.node_autoscaling_min
    max_nodes      = var.node_autoscaling_max
    server_type    = var.secondary_node_type
    location       = var.node_location
    pool_name      = "general-workers"
    target_cpu_pct = 70
    target_mem_pct = 80
  }
}

output "node_topology" {
  value = {
    primary_node_ip   = hcloud_server.primary_node.ipv4_address
    secondary_node_ip = length(hcloud_server.secondary_worker_node) > 0 ? hcloud_server.secondary_worker_node[0].ipv4_address : null
    ha_enabled        = var.enable_secondary_worker_node
    autoscaling       = local.node_autoscaling_config
  }
  description = "Summary of K3s cluster node topology and horizontal node autoscaling configuration"
}
