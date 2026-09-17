# Hetzner inventory (OpenTofu)

This directory **adopts the two Helsinki servers that already exist**. It
does not mint a third VM.

| Role | Console name | ID | Type | Public IPv4 | RAM |
|---|---|---|---|---|---|
| k3s server, Argo, ingress, prod, staging | `ubuntu-24gb-hel1-1` | 163417666 | cpx52 | 89.167.29.39 | 24 GB |
| k3s agent, Codex Jobs only | `ubuntu-4gb-hel1-1` | 163580094 | cpx22 | 157.180.80.188 | 4 GB |

Both sit in `placement-group-1`, location `hel1`, behind
`k3s-cluster-firewall` (22 / 80 / 443 / 6443 / ICMP). A 100 GB volume is
already attached to the cpx52. `marisstella.dev` A records already point
at the cpx52 — this stack will not rewrite them.

## One cluster, two nodes — not two clusters, not one overloaded box

The 4 GB box cannot host k3s + Argo + ingress + a Codex worker. The 24 GB
box can host the control plane and the products, and should. Join the
cpx22 as a **tainted agent node** so Codex Jobs cannot starve
`marisstella.dev`.

`maxConcurrent: 1` on that agent is a hardware limit, not just a quota
policy. If the cpx22 is down, Jobs stay Pending; they do not spill onto
the control plane unless you change the Job tolerations in git.

## What Tofu is allowed to do

- Import the two servers (`prevent_destroy = true`).
- Attach a new private network (`10.10.0.10` / `10.10.0.11`) so k3s join
  traffic can leave the public internet.
- Optionally take over the existing firewall so 6443 can later shrink.
- Never replace either server. A plan that says `must be replaced` is a
  bug — do not apply it.

Bootstrap (k3s + Argo) is **not** cloud-init on these boxes: they already
booted. Scripts live in [`../bootstrap/`](../bootstrap/) and you run them
once over SSH from a laptop. `run_bootstrap` defaults to false so an
agent cannot be the first apply of the box it will live on.

## Commands

```bash
export HCLOUD_TOKEN=...          # Read is enough for discover/plan
cd infra
tofu init
./scripts/discover.sh            # prints firewall + volume IDs
./scripts/assert_hcloud_read_only.sh   # 403 = keep; anything else = rotate
tofu plan                        # import + in-place attach only
# tofu apply                     # laptop only, and only with a Write token
```

GitHub Actions may run `tofu validate` / `tofu fmt`, and probes
`HETZNERREADAPIKEY` as Read-only (mapped to env `HCLOUD_TOKEN`). It
must not apply. Dispatch preflight uses `HETZNERSSHKEY` — which currently
holds a public key and so cannot open a session; see `OWNER_CHECKLIST.md`.
Names live there too. `Public surface check` needs no secret and answers
what the hostnames serve regardless.

Hetzner has no hard euro spend cap (usage alerts are email-only). A
Write token in CI is unbounded create/resize. Do not add one. See
`OWNER_CHECKLIST.md`.
