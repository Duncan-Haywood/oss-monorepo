output "control_plane" {
  value = {
    id           = hcloud_server.control_plane.id
    name         = hcloud_server.control_plane.name
    ipv4         = local.control_plane.ipv4
    private_ipv4 = var.create_private_network ? local.control_plane_priv : null
    role         = "k3s server + Argo + prod + staging + ingress"
  }
}

output "agent" {
  value = {
    id           = hcloud_server.agent.id
    name         = hcloud_server.agent.name
    ipv4         = local.agent.ipv4
    private_ipv4 = var.create_private_network ? local.agent_priv : null
    role         = "k3s agent, tainted dedicated=agents — Codex Jobs only"
  }
}

output "firewall_name" {
  value = data.hcloud_firewall.cluster.name
}

output "firewall_id_live" {
  value       = data.hcloud_firewall.cluster.id
  description = "Pass this as TF_VAR_firewall_id and import hcloud_firewall.managed to own the rules."
}

output "dns_do_not_touch" {
  value = {
    marisstella_dev   = "A @ and A * already point at 89.167.29.39 — this stack will not rewrite them."
    duncanhaywood_dev = "Zone exists (4 records). Import later; do not recreate."
  }
}

output "bootstrap_next" {
  value = <<-EOT
    1. tofu plan   (must show import / in-place attach, NEVER destroy/replace of either server)
    2. tofu apply  (from your laptop, HCLOUD_TOKEN in env)
    3. SSH to ${local.control_plane.ipv4} and run bootstrap/install-k3s-server.sh
    4. SSH to ${local.agent.ipv4} and run bootstrap/install-k3s-agent.sh
    5. On the control plane: bootstrap/install-argocd.sh
    6. Merge GitOps PRs; do not SSH to 'fix' workloads after that.
  EOT
}
