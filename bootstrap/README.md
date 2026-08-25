# Bootstrap (once)

These scripts run **over SSH, from a laptop, against the two existing
Helsinki boxes**. They are not cloud-init: both servers have already
booted.

Laptop helpers (read-only until you decide):

- `preflight.sh` — SSH to both public IPs and say whether k3s is already there.
- `label-existing.sh` — if the cpx52 already has k3s, add the labels GitOps
  expects instead of re-installing.

Order:

1. OpenTofu has imported the servers and (ideally) attached `10.42.0.0/24`.
2. `install-k3s-server.sh` on `ubuntu-24gb-hel1-1` (89.167.29.39).
3. `install-k3s-agent.sh` on `ubuntu-4gb-hel1-1` (157.180.80.188) with
   `K3S_TOKEN` from the server's `/var/lib/rancher/k3s/server/node-token`.
4. `install-argocd.sh` on the server. This applies `root-application.yaml`,
   the only snowflake Application.
5. After that, stop SSHing in to change workloads. PRs only.

If the private NIC is not up yet, rerun the server script with
`ADVERTISE_IP=89.167.29.39` so k3s binds the public address, then move
it to `10.42.0.10` once Tofu has attached the network.

If k3s is **already** running on the cpx52 (the firewall name suggests
it might be), do not re-run the installer. The script exits 0 when it
sees `/etc/rancher/k3s/k3s.yaml`. Add the missing labels by hand:

```bash
kubectl label node ubuntu-24gb-hel1-1 hcloud/node-role=control-plane hcloud/instance=ubuntu-24gb-hel1-1 --overwrite
```

Then join the cpx22 as an agent. Confirm with `kubectl get nodes -o wide`
before `install-argocd.sh`.

Argo's install manifests are fetched from GitHub at pin `v3.5.1`. That
is bootstrap, not GitOps — we do not recreate Argo or k3s on every sync.
