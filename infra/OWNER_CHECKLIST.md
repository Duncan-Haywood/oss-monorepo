# What you still have to type

An agent can write this tree. It cannot mint accounts, money, or
identities. Nothing here applies itself.

## The short version: three seals, one command

Three sealed secrets are what the live site, working CI, and the Codex
worker are each waiting on. They are items 8, 9 and "Publish
`tools.marisstella.dev`" below, and they were spread across six files
because each was written when it became true. From a laptop with a
kubeconfig and `kubeseal`:

```bash
./bootstrap/scripts/seal-owner-secrets.sh --dry-run   # preflight only
./bootstrap/scripts/seal-owner-secrets.sh             # all three, in order
```

It prompts for each token with echo off, verifies against the GitHub API
that the token can do the one thing its pod needs (a mis-scoped one is
rejected before it becomes a CrashLoopBackOff), seals it, and wires it
into the right `kustomization.yaml`. Only ciphertext is written. Commit
the `*.sealed.yaml` files, push, and Argo does the rest.

Read the rest of this file for what each token is and how to scope it —
the script assumes you have already decided that. What it does not do:
mint the tokens, flip `CI_RUNNER`, or enable the governor. Those stay
yours, deliberately.

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

**Or the plan quota, if you would rather not spend money.** Since
2026-08-29 the worker also accepts `CODEX_AUTH_JSON` — the contents of
`~/.codex/auth.json` after a `codex login` — and a tick on that credential
costs nothing extra. It is a genuine alternative, not a shortcut, and the
old warning here is the reason it is not simply the better one:

- A plan has **no euro hard stop**. The ceiling is the plan's 5-hour and
  weekly windows, which is a different kind of limit from a spend cap.
- Those windows are shared with whoever is signed into that account. Do
  **not** use your main ChatGPT/Plus/Pro login unless you are content for
  the fleet to compete with your own interactive use; a separate plan seat
  avoids the trade entirely.

Seal one or the other (or both — the non-billing one wins, and the worker
logs which it used). Either way the governor stays `suspend: true` /
`enabled: false` until you flip it, and the worker treats the 429 spend
codes as exit 42 and a rejected credential as exit 43.

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
6. ~~ACME email~~ — **no longer required (2026-08-30).** An ACME account
   contact is optional, so `gitops/platform/cert-manager/issuer.yaml`
   ships without one instead of with a placeholder. Add a real address
   later if you want Let's Encrypt's expiry warnings; nothing waits on it.
7. Merge this PR, then from the laptop with the **write** token:
   `tofu plan` (must not replace either server) → `tofu apply` → the
   three bootstrap scripts.
8. **Codex credential.** Pick one of the two routes described under
   "Codex" above — they are equally supported and the choice is yours:
   - *Plan quota (no money spent).* `codex login` once, then seal
     `codex-secrets` with `CODEX_AUTH_JSON` (the whole contents of
     `~/.codex/auth.json`) + `GH_TOKEN`. No OpenAI org, no API key, no
     billing change. This is the "use the built-in quota" route.
   - *Metered (euro ceiling).* New OpenAI org + hard spend limit +
     project API key; seal `codex-secrets` with `OPENAI_API_KEY` +
     `GH_TOKEN`.

   Seal both and the subscription wins — it is the one that does not
   bill, and the worker logs which mode it used. Either way, seal in a
   follow-up PR, and only then flip
   `gitops/agents/governor/cronjob.yaml` `suspend: false` and
   `policy.json` `"enabled": true`.
9. **Restore CI.** Every workflow has been red since 2026-08-26 with
   `runner_id: 0` and zero steps — jobs that were never assigned a
   runner, because metered Actions minutes on this private repo ran out.
   Two steps bring it back on hardware you already pay for:
   seal `actions-runner-secrets` from
   `gitops/ci/secrets/actions-runner-token.template.yaml` (a
   fine-grained PAT for this repo with **Administration: Read and
   write**), then set the repository variable `CI_RUNNER` =
   `self-hosted`. Clearing that variable moves all 217 workflows back to
   GitHub-hosted runners when your minutes reset. Details and the
   security posture: `gitops/ci/README.md`.

## Publish `tools.marisstella.dev` (the whole product portfolio)

This is the shortest path from "164 finished tools nobody can reach" to a
public URL, and every step in it is yours — none of it is waiting on an
agent. `gitops/README.md` explains *why* each one exists; this is the
order to type them in and how to tell each worked.

The build half is done and was rehearsed with the exact commands the pod
runs (`PAGES_BASE_URL=https://tools.marisstella.dev/ node
platform/pages/build.mjs --out=… && node platform/pages/check.mjs
--dist=…`). Re-run on 2026-08-31 against that day's `main`: **169
products, 508 pages, no dead links**, and no `duncan-haywood.github.io`
URL surviving anywhere in the output. (The 2026-08-29 run said 164 and
446; the difference is ventures merged since, not a regression.) Nothing
about it depends on GitHub Actions (no runner since 2026-08-26) or on
GitHub Pages (not enabled, and a private repo's Pages site is not public
on the free tier anyway).

The 2026-08-31 run also served that artifact and drove it in Chromium,
which the earlier rehearsal did not do — `build.mjs` and `check.mjs`
passing proves the *files* are right, not that a visitor can use them.
The hub, the MCP manifest-compare tool (fixture loads, comparison renders
a verdict) and the FBA calculator (one input change propagated through
15+ derived tables) all worked, with zero console or page errors, and the
no-warranty clause and Sponsors link present on the product page. So what
is waiting on step 1 below is a site already known to work, not one that
will need debugging once it is reachable.

**DNS — already done, no action needed.** `tools.marisstella.dev`
already resolves to `89.167.29.39` (verified 2026-08-29:
`getent hosts tools.marisstella.dev`) — `marisstella.dev`'s existing
wildcard `A/*` record already covers the subdomain, so the A record this
checklist used to list as step 1 does not need adding.

1. **The clone token.** The repo is private, so the pod's `fetch` init
   container cannot clone anonymously. Mint a **fine-grained** PAT — this
   repository only, **Contents: Read-only**, nothing else — then seal it
   exactly as `gitops/prod/secrets/portfolio-repo-token.template.yaml`
   says, commit `portfolio-repo-token.sealed.yaml` beside the template,
   and add that filename to `gitops/prod/kustomization.yaml`. Verify:
   `kubectl -n prod get pods -l app=portfolio-site` goes from
   `Init:CrashLoopBackOff` to `Running`, and
   `kubectl -n prod logs deploy/portfolio-site -c build` ends in
   `built … files`.

2. ~~A real ACME contact.~~ **Removed 2026-08-30 — this is no longer an
   owner action.** The issuers used to carry
   `replace-me@duncanhaywood.dev` and this list said no certificate could
   issue until it became a real mailbox. An ACME account contact is
   optional, so `gitops/platform/cert-manager/issuer.yaml` now omits
   `email` entirely and registers normally. Verify alongside step 1:
   `kubectl -n prod get certificate` reports `READY=True`.

   Optional, any time: add a real address back to both issuers to receive
   Let's Encrypt expiry warnings. cert-manager updates the existing
   account registration in place — no reissue, no downtime.

**Step 1 is now the only thing standing between the portfolio and a live
site.** Once it lands the site is reachable, on a Let's Encrypt
**staging** certificate — browsers will warn, because staging is not a
trusted root.

3. **The issuer flip, last.** Only after a staging certificate has
   issued, change the Ingress annotation
   `cert-manager.io/cluster-issuer` in `gitops/prod/portfolio-site.yaml`
   from `letsencrypt-staging` to `letsencrypt-prod`, and update
   `gitops/tests/test_manifests.py::test_portfolio_site_starts_on_the_staging_certificate_issuer`
   which pins it. Unlike 1–2 this one is not owner-only — it is an
   ordinary code change an agent can open as a PR once you confirm the
   staging certificate issued, and asking for it that way is less work
   than editing two files by hand.

Deliberately **not** on this list: enabling GitHub Pages. That is a
separate queued ask (`deploy-settings`) and, on its own, would not put
these tools in front of anyone — see `portfolio/hosting/README.md`'s
2026-08-29 amendment.

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
- ~~What keeps serving on `marisstella.dev`. This stack will not steal it.~~
  Resolved: nothing was serving it. ingress-nginx runs `hostNetwork: true`
  on the cpx52, so it holds :80/:443 and no second listener could bind
  there; the apex resolved to the box and fell to the default backend,
  which is what issue #1925 reported. `gitops/prod/portfolio-apex.yaml`
  now claims `marisstella.dev` and `www.marisstella.dev` and 301s both to
  `tools.marisstella.dev`. No owner action — it goes live with the same
  clone token the site itself waits on.
- Whether `duncanhaywood.dev` should get an A record for a cluster
  status host later.
- How high the isolated OpenAI hard limit should be (start low; raise
  from the dashboard, not from a key the cluster holds).
