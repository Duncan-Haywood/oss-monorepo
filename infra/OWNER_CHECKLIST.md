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

Actions secrets that exist (Settings → Secrets and variables → Actions).
Names are exact; values never go in git.

| Name | What | Used by |
|---|---|---|
| `HETZNERSSHKEY` | SSH private key for `root@89.167.29.39` and `root@157.180.80.188` | `hetzner-gitops-ci.yml` preflight (`workflow_dispatch`, `preflight: true`) |
| `HETZNERREADAPIKEY` | Hetzner Cloud API token, **Read** only | `hetzner-gitops-ci.yml` `hcloud-scope` (maps to env `HCLOUD_TOKEN` for `hcloud` / Tofu plan). Laptop: `export HCLOUD_TOKEN=` the same value |
| `CLAUDETRIGGERAPIKEY` | Claude Code routine API trigger bearer | `claude-routine-trigger.yml` only. Not this stack |

Do not add a Hetzner **Write** token, an OpenAI Admin key, an age
private key, or a kubeconfig as an Actions secret.

Do not create a third VM. The next `tofu apply` must import / attach, not replace.

## What is okay now

**GitHub token — yes.** Fine-grained PAT, this repo only:

- Contents: Read and write
- Pull requests: Write
- Metadata: Read
- Expiration: 90 days
- Off: Administration, Secrets, Workflows, Actions, Environments, Pages

That is the agents identity (`GH_TOKEN` in `codex-secrets`). It opens PRs.
It must not be able to push `main` — confirm branch protection requires a PR.
Do not reuse it for Argo. Argo gets a **read-only deploy key** (or a second
App with contents:read only).

Hold the PAT until the cluster can seal it. Do not put it in the `agents`
namespace as plaintext, and do not mount it into a workflow that does not
need it.

**SSH — `HETZNERSSHKEY` is already in Actions.** Dispatch
`hetzner-gitops CI` with `preflight: true`. Read-only: it never
installs k3s or runs tofu.

**Hetzner Read token — `HETZNERREADAPIKEY` is already in Actions.** CI
probes `POST /servers` with an empty body (cannot create a server).
**403 = keep it. Anything else = rotate, it can write.**
`infra/scripts/assert_hcloud_read_only.sh` is that probe. On a laptop,
`export HCLOUD_TOKEN=` the same value for `make discover` / `tofu plan`.

**Hetzner write token — still no, not in Actions.** Hetzner Cloud has
**no hard euro spend cap**. Console "Usage" alerts email you and keep
billing ([billing FAQ](https://docs.hetzner.com/cloud/billing/faq/)). A
Read+Write token can create servers, resize the cpx52, and attach
volumes until the account resource limits (hundreds of servers). Tofu
locks and `prevent_destroy` are not a spend limit — a leaked token talks
to the API directly.

Keep the Read+Write token on the laptop for the one `tofu apply`. Never
in Actions, never in `agents`.

**Codex — separate OpenAI account, not your main one.** That is the
right split.

- New OpenAI org (or a project on an org that is not your personal ChatGPT)
- Dashboard: monthly spend limit → **Enforce a hard limit**
  ([spend limits](https://developers.openai.com/api/docs/guides/spend-limits)).
  Hit → API returns 429 (`organization_spend_limit_exceeded` /
  `project_spend_limit_exceeded`). Enforcement can overshoot slightly.
- Mint a **project API key**. Put `OPENAI_API_KEY` in the sealed secret.
- Do **not** put an Admin API key in the cluster. The Admin API can raise
  the spend limit — that is the workaround. A normal project key cannot.
- Do **not** `codex login` with your main ChatGPT/Plus/Pro account. That
  burns the personal 5-hour / weekly quota and has no euro hard stop.

Governor stays `suspend: true` / `enabled: false` until that key is
sealed. The worker already accepts `OPENAI_API_KEY` and treats those 429
codes as exit 42.

## You do once (laptop)

1. Laptop: `export HCLOUD_TOKEN=` the `HETZNERREADAPIKEY` value, then
   `make discover` and paste `firewall_id` / `volume_id` into
   `infra/terraform.tfvars` (gitignored).
2. Confirm SSH: Actions preflight (`HETZNERSSHKEY`), or
   `bootstrap/preflight.sh` from a machine that has the key.
3. If k3s is already on the cpx52, `bootstrap/label-existing.sh` instead
   of `install-k3s-server.sh`.
4. Fine-grained GH token (agents) + read-only deploy key (Argo).
5. Age keypair — `bootstrap/scripts/gen-age-key.sh`. Private key stays
   offline. Public key goes in `.sops.yaml`.
6. ACME email — replace `replace-me@duncanhaywood.dev` in
   `gitops/platform/cert-manager/issuer.yaml`.
7. Merge this PR, then from the laptop with the **write** token:
   `tofu plan` (must not replace either server) → `tofu apply` → the
   three bootstrap scripts.
8. New OpenAI org + hard spend limit + project API key. Seal
   `codex-secrets` (`OPENAI_API_KEY`, `GH_TOKEN`) in a follow-up PR.
   Only then flip `gitops/agents/governor/cronjob.yaml` `suspend: false`
   and `policy.json` `"enabled": true`.

## You do not hand to an agent

- The only copy of the age private key
- A Hetzner **Read+Write** token
- An OpenAI **Admin** API key, or the login for the billing org
- The GitHub App `.pem`
- A kubeconfig

A Hetzner **Read** token and the agents GH PAT are fine to store as
Actions secrets. They cannot mint servers or raise an OpenAI hard limit.

## You decide (not blocking the scaffold)

- Keep 6443 world-open until the private net (`10.42.0.10`) works, then
  flip `expose_k3s_api_publicly = false`.
- What keeps serving on `marisstella.dev`. This stack will not steal it.
- Whether `duncanhaywood.dev` should get an A record for a cluster
  status host later.
- How high the isolated OpenAI hard limit should be (start low; raise
  from the dashboard, not from a key the cluster holds).
