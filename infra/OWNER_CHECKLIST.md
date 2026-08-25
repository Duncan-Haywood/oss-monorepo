# What you still have to type

An agent can write this tree. It cannot mint accounts, money, or
identities. Nothing here applies itself.

## Already true (from the console you pasted)

- Two Helsinki servers exist: cpx52 `#163417666` and cpx22 `#163580094`.
- `k3s-cluster-firewall` is on both (22 / 80 / 443 / 6443 / ICMP).
- `marisstella.dev` A/@ and A/* point at `89.167.29.39`.
- `duncanhaywood.dev` zone exists (4 records, not imported here).
- Placement group `placement-group-1`.
- 100 GB volume on the cpx52.

Do not create a third VM. The next `tofu apply` must import / attach, not replace.

## You do once

1. **Hetzner API token** — export `HCLOUD_TOKEN` on your laptop (or in
   GitHub Actions for `tofu plan` only). Never mount it into the `agents`
   namespace.
2. **SSH key you control** — confirm you can reach both public IPv4s.
   Tell me (or check yourself) whether k3s is already running on the
   cpx52 before running `bootstrap/install-k3s-server.sh`.
3. **`make discover`** — paste `firewall_id` and `volume_id` into
   `infra/terraform.tfvars` (gitignored).
4. **GitHub identities** — two, not one:
   - Argo: read-only deploy key or GitHub App on this repo.
   - Agents: contents + pull-requests, no push to `main`, no admin.
5. **Codex access token** — ChatGPT login / `codex login --device-auth`
   on a machine you control, then seal `CODEX_ACCESS_TOKEN`. This is
   unattended use of your personal quota.
6. **Age keypair** — `bootstrap/scripts/gen-age-key.sh` on the laptop.
   Private key stays offline. Public key goes in `.sops.yaml`.
7. **ACME email** — replace `replace-me@duncanhaywood.dev` in
   `gitops/platform/cert-manager/issuer.yaml`.
8. **Merge this PR**, then from the laptop: `tofu plan` (must not
   replace either server) → `tofu apply` → the three bootstrap scripts.
9. **Seal `codex-secrets`** and a follow-up PR. Only then flip
   `gitops/agents/governor/cronjob.yaml` `suspend: false` and
   `policy.json` `"enabled": true`. That switch spends paid/personal
   Codex budget and is yours.

## You do not hand to an agent

- The only copy of the age private key
- The Hetzner token
- The Codex token
- The GitHub App `.pem`
- A kubeconfig

## You decide (not blocking the scaffold)

- Keep 6443 world-open until the private net (`10.42.0.10`) works, then
  flip `expose_k3s_api_publicly = false`.
- What keeps serving on `marisstella.dev`. This stack will not steal it.
- Whether `duncanhaywood.dev` should get an A record for a cluster
  status host later.
