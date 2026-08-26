# The live firewall is already named k3s-cluster-firewall and is applied
# to both servers. We read it by name so server attachments work before
# anyone runs `tofu import` on the firewall resource itself.
#
# Taking over the rules (so 6443 can later shrink to the private net)
# is a second step: set firewall_id and `tofu import hcloud_firewall.managed`.

data "hcloud_firewall" "cluster" {
  name = "k3s-cluster-firewall"
}

resource "hcloud_firewall" "managed" {
  count = var.firewall_id == "" ? 0 : 1

  name = "k3s-cluster-firewall"

  # SSH — current console allows any IPv4/IPv6. Tighten via ssh_allowed_cidrs.
  dynamic "rule" {
    for_each = var.ssh_allowed_cidrs
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = "22"
      source_ips = [rule.value]
    }
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "icmp"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # k3s API. Keep world-open only while expose_k3s_api_publicly is true
  # (matches today's console). After the private network is verified,
  # flip the variable and this rule disappears.
  dynamic "rule" {
    for_each = var.expose_k3s_api_publicly ? [1] : []
    content {
      direction  = "in"
      protocol   = "tcp"
      port       = "6443"
      source_ips = ["0.0.0.0/0", "::/0"]
    }
  }

  apply_to {
    server = hcloud_server.control_plane.id
  }

  apply_to {
    server = hcloud_server.agent.id
  }

  labels = {
    cluster = "hel1-k3s"
    managed = "opentofu"
  }

  lifecycle {
    prevent_destroy = true
  }
}
