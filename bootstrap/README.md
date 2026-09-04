# Bootstrap (once)

These scripts run **over SSH, from a laptop, against the two existing
Helsinki boxes**. They are not cloud-init: both servers have already
booted.

Laptop helpers (read-only until you decide):

- `preflight.sh` — SSH to both public IPs and say whether k3s is already there.
  Same script runs from Actions if you dispatch `hetzner-gitops CI` with
  `preflight: true` (uses Actions secret `HETZNERSSHKEY`). **That dispatch
  cannot work today:** `HETZNERSSHKEY` holds a public key, so the job exits on
  its format check before any SSH is attempted — measured 2026-09-04, run
  33884253173. See `infra/OWNER_CHECKLIST.md` for the one-minute fix. From a
  laptop with the real private key the script is unaffected.
  For "what do the public hostnames serve", you do not need this or the key at
  all — dispatch `Public surface check`, which asks them over the open
  internet with no credential.
- `label-existing.sh` — if the cpx52 already has k3s, add the labels GitOps
  expects instead of re-installing.

Order:

1. OpenTofu has imported the servers and (ideally) attached `10.10.0.0/24`.
2. `install-k3s-server.sh` on `ubuntu-24gb-hel1-1` (89.167.29.39).
3. `install-k3s-agent.sh` on `ubuntu-4gb-hel1-1` (157.180.80.188) with
   `K3S_TOKEN` from the server's `/var/lib/rancher/k3s/server/node-token`.
4. `install-argocd.sh` on the server. This applies `root-application.yaml`,
   the only snowflake Application.
5. `scripts/seal-owner-secrets.sh` — the three sealed secrets that everything
   downstream waits on: the public site's read-only clone token, the
   self-hosted Actions runner PAT, and the Codex worker's credential pair.
   Needs a kubeconfig and `kubeseal`, not SSH. See below.
6. After that, stop SSHing in to change workloads. PRs only.

## The three seals

```bash
./bootstrap/scripts/seal-owner-secrets.sh --dry-run   # preflight, asks for nothing
./bootstrap/scripts/seal-owner-secrets.sh             # all three, in order
./bootstrap/scripts/seal-owner-secrets.sh site        # or one at a time
```

It prompts for each token with echo off, checks against the GitHub API that
the token can actually do the one thing its pod needs, seals it, and adds the
result to the right `kustomization.yaml`. It writes only ciphertext: no
plaintext token reaches the disk, and none appears in `ps`. Then commit the
`*.sealed.yaml` files and push — Argo does the rest.

It replaces the hand procedure in each `secrets/*.template.yaml` header, which
is still there and still correct if you would rather type it. Two things the
script gets right that are easy to get wrong by hand: it reads the
sealed-secrets controller's Service name from the cluster rather than assuming
kubeseal's default (which is wrong here, and fails before sealing anything),
and it never has you put a live token in a file you then have to remember not
to commit.

`infra/OWNER_CHECKLIST.md` is what each token is for and how to scope it.

If the private NIC is not up yet, rerun the server script with
`ADVERTISE_IP=89.167.29.39` so k3s binds the public address, then move
it to `10.10.0.10` once Tofu has attached the network.

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
