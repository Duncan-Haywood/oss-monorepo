# Hetzner Cloud Firewall managed declaratively via Terraform
resource "hcloud_firewall" "k3s_firewall" {
  name = "k3s-cluster-firewall"

  # Inbound Rule: HTTP
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
    description = "Allow inbound HTTP traffic"
  }

  # Inbound Rule: HTTPS
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
    description = "Allow inbound HTTPS traffic"
  }

  # Inbound Rule: SSH (Hardened: Protected by Key-Only SSH Auth & Fail2ban)
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
    description = "Allow inbound SSH access (Key auth required, password auth disabled)"
  }

  # Inbound Rule: K3s API Server (SEC-013: Consider restricting to Tailscale/VPN IP ranges)
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "6443"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
    description = "Allow K3s API server access (TLS client cert auth enforced)"
  }

  # Inbound Rule: ICMP (Ping)
  rule {
    direction = "in"
    protocol  = "icmp"
    source_ips = [
      "0.0.0.0/0",
      "::/0"
    ]
    description = "Allow ICMP Ping"
  }
}

# Attach firewall to the Hetzner server (IP: 89.167.29.39)
resource "hcloud_firewall_attachment" "k3s_firewall_attachment" {
  firewall_id = hcloud_firewall.k3s_firewall.id
  server_ids  = [156581081] # ubuntu-16gb-hel1-1 server ID
}
