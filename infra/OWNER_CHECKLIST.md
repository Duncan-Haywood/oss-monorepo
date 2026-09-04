# What you still have to type

An agent can write this tree. It cannot mint accounts, money, or
identities. Nothing here applies itself.

## The short version: two seals, one command

**Changed 2026-09-01: this was "three seals" until CI came back on its
own.** Two sealed secrets are what the live site and the Codex worker are
waiting on — items 8 and "Publish `tools.marisstella.dev`" below. The
third, item 9's runner PAT, is no longer blocking anything: GitHub
resumed assigning runners at 2026-09-01T00:00:53Z, and the PRs run since
have passed on merit. Seal it too if you want insurance against the next
allowance cycle, but do it last.

They were spread across six files because each was written when it became
true. From a laptop with a kubeconfig and `kubeseal`:

```bash
./bootstrap/scripts/seal-owner-secrets.sh --dry-run site agents   # preflight
./bootstrap/scripts/seal-owner-secrets.sh site agents             # do it
```

`site` is the live-site clone token; `agents` is the Codex credential.
Naming both targets is deliberate — **passing no arguments seals all
three**, which walks you through the optional runner PAT as well and
reports `did not seal: ci` if you press Enter past it. Add the third
later, on its own, if you want it:

```bash
./bootstrap/scripts/seal-owner-secrets.sh ci    # optional, see item 9
```

Its one branching question — which Codex credential — now defaults to the
plan-quota route on a bare Enter, because item 8 below records that you have
already chosen it. Typing `2` still seals the metered key.

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
8. **Codex credential.** Two routes are supported. **You have stated a
   preference for the first** — recorded 2026-09-01, from the standing
   instruction for these scheduled runs: *"I also want the codex cli to be
   set up to use up the built in quota for dev work."* That settles the
   binary this item used to open with ("the choice is yours"); the second
   route is kept below because it is still supported, not because
   anything is still waiting on you to choose.

   - **Plan quota — the route you asked for; no money spent.**
     `codex login` once on a laptop, then seal `codex-secrets` with
     `CODEX_AUTH_JSON` (the whole contents of `~/.codex/auth.json`) +
     `GH_TOKEN`. No OpenAI org, no API key, no billing change. If
     `~/.codex/auth.json` does not exist after logging in, the CLI put the
     credential in your OS keychain — put
     `cli_auth_credentials_store = "file"` in `~/.codex/config.toml` and
     log in again.

     The one caveat worth knowing before you seal: a plan has **no euro
     hard stop**, only 5-hour and weekly windows, and those windows are
     shared with whoever is signed into that account. If you seal your
     day-to-day ChatGPT login, the fleet competes with your own
     interactive use for the same quota. A separate seat avoids that;
     `policy.json`'s `reserveForInteractive` (0.1) and
     `weeklyBudgetFraction` (0.85) are what soften it if you share one.

   - *Metered (euro ceiling) — the alternative, unchanged.* New OpenAI org
     + hard spend limit + project API key; seal `codex-secrets` with
     `OPENAI_API_KEY` + `GH_TOKEN`. Worth it only if you want a hard
     currency ceiling more than you want a tick to cost nothing.

   Seal both and the subscription wins — it is the one that does not
   bill, and the worker logs which mode it used on every run. Either way,
   seal in a follow-up PR, and only then flip
   `gitops/agents/governor/cronjob.yaml` `suspend: false` and
   `policy.json` `"enabled": true`.

   What that flip then runs is `gitops/agents/queue/*.yaml`, and since
   2026-09-01 those are ordered to match the rest of that same standing
   instruction — deployment/CI-CD first, then marketing and distribution.
   Nothing about the queue needs your input; it is listed here only so the
   spend is predictable before you authorise it.
9. ~~**Restore CI.**~~ **Not needed as of 2026-09-01 — optional.** Every
   workflow was red from 2026-08-26 with `runner_id: 0` and zero steps —
   jobs never assigned a runner. Actions minutes on this private repo are
   metered, so the ceiling was some account-level Actions condition, but
   *which* one is not observable from here (exhausted included minutes, a
   spending limit, a payment problem, or Actions switched off all look
   identical); only your billing page settles it. **It resolved itself
   either way**: GitHub started assigning real runners again at
   2026-09-01T00:00:53Z, and the PRs run since have passed on merit
   (#2601, #2603, #2605). Runner availability is back with nothing from
   you.

   That is narrower than "everything is green", deliberately. Individual
   workflows still fail on their own merits, and one of them is worth
   your attention: **`Claude routine trigger` is failing 401 on a live
   token, not on a missing one.** Its `CLAUDETRIGGERAPIKEY` secret is
   set, and the API returns *"OAuth access token has been revoked"*
   (run 33547527610). With `*/20` scheduling that is 72 runs a day, and
   **measured, not the ~360/day this line used to say**: on a 401
   `fire()` returns 2 and the workflow's own `case` exits on that value
   (the `2) exit 1` arm) rather than trying the four remaining slots, so five
   consecutive runs (33553452882, 33551039615, 33549288450, 33547527610,
   33545549251) each occupied a real runner for 2-3 seconds, not the
   ~16 minutes a full 5-fire loop would take. That is **72 real API
   calls a day**, ~72 billed Actions minutes (~$17/month), not the
   larger figures this line and `routine-trigger-cadence` in your
   decision queue used to carry — safe, but still burning the same
   metered Actions allowance whose exhaustion caused the 2026-08-26
   starvation.

   **Stopped on 2026-09-02, without answering the question.** The `fire`
   job is now gated on a repository variable, so a scheduled run is
   skipped before a runner is assigned: no minute billed, no red check,
   and 471 consecutive failed runs is where that count stops. Nothing
   else about the workflow changed, and `workflow_dispatch` still runs
   unconditionally so a new token is testable on demand.

   So this is no longer costing you anything, and it is no longer an
   argument for hurrying. When you do want the cadence back:

   1. Mint a fresh token at <https://claude.ai/code/routines> and update
      the `CLAUDETRIGGERAPIKEY` secret.
   2. Actions tab → `Claude routine trigger` → **Run workflow**. It
      should report `fired:` rather than HTTP 401.
   3. Settings → Secrets and variables → Actions → **Variables**: set
      `ROUTINE_TRIGGER_ENABLED` to `true`. That is what re-arms the
      schedule; clearing it switches the cadence off again.

   Doing (3) before (1) and (2) restores the burn rather than the
   cadence, which is why it is last. Deleting the workflow outright is
   still yours alone — it is the `routine-trigger-cadence` row in your
   decision queue, and leaving it gated is now a real third option.

   What is left here is insurance, worth doing but **after** the two
   seals above and below that are actually blocking. Self-hosted runners
   are not metered, so they make the next cycle a non-event whichever
   sub-cause it was:
   seal `actions-runner-secrets` from
   `gitops/ci/secrets/actions-runner-token.template.yaml` (a
   fine-grained PAT for this repo with **Administration: Read and
   write**), then set the repository variable `CI_RUNNER` =
   `self-hosted`. Clearing that variable moves every workflow back to
   GitHub-hosted runners. Details and the security posture:
   `gitops/ci/README.md`.

## Publish `tools.marisstella.dev` (the whole product portfolio)

This is the shortest path from "174 finished tools nobody can reach" to a
public URL, and every step in it is yours — none of it is waiting on an
agent. `gitops/README.md` explains *why* each one exists; this is the
order to type them in and how to tell each worked.

**Note what this section is and is not about, since 2026-09-02.** The
domain itself is no longer dark: `marisstella.dev` and `www` already serve
a front door with no owner action (see the `marisstella.dev` bullet under
"You decide" below), and it mirrors 174 of the 174 tools directly. Step 1
below no longer publishes any tool a stranger cannot already reach; what it
buys is the canonical hostname and indexability.

**Changed 2026-09-03, twice.** That read "162 ... the remaining 7" until the
mirror learned the same entry-point rule `platform/pages/build.mjs` already
used (`index.html`, then `site/index.html`). Five ventures keeping a flat
static site in `site/` were being reported as apps with a build step, and a
sixth dropped as collateral for linking to one of them.

Then it read "168 ... the remaining 1", and **that last tool was never
waiting on the seal at all.** `build.mjs` resolves an entry point through
`ENTRY_CANDIDATES` *and* `ENTRY_OVERRIDES`, and copying only the first list
into the mirror left `ai-engineering-academy` — a hub page and six working
electronics calculators, all tested, all carrying disclaimers and usage
tracking — filed as "not a static page the mirror can serve". The canonical
build published all seven; the canonical host serves nothing until Step 1;
so those seven pages were public nowhere, and the checklist recorded that as
one tool the seal would deliver. The mirror now imports both lists from
`build.mjs` rather than restating either, and serves them today. Step 1 is
still worth doing — it is what makes `tools.marisstella.dev` itself resolve
and lets these pages be indexed — but it is now worth the canonical hostname
and search, not any tool's reachability.

**Corrected 2026-09-02.** This paragraph used to end "every category card on
it links into `tools.marisstella.dev`, which still serves nothing until the
token is sealed" — the same wrong reading `CLAUDE.md` corrects at length.
The front door's category cards link to same-page anchors, its primary
call to action opens a mirrored tool on this domain, and its single
reference to the tools host is fine print honestly labelled as not yet
live. So the seal is worth doing and is not the difference between a dead
end and a working product.

That ratio moved a long way on 2026-09-02, and it changes what Step 1 is
worth. The mirror used to hold 53 tools because a ConfigMap-delivered
copy of the site was bounded by bytes; storing it gzipped returned 3.1x
and the bound stopped binding, so the front door now serves nearly the
whole catalogue itself. Sealing the token is still the right end state —
it retires the mirror, serves the canonical host, and lets those pages be
*indexed*, which the mirrored copies deliberately are not — but it is no
longer the difference between a stranger reaching 53 tools and reaching
169. Since the `ENTRY_OVERRIDES` fix above it is not a tool-count difference
at all: the apex serves all 174. What Step 1 buys is the canonical host and
search.

**Updated 2026-09-03, twice.** This paragraph said 159 until #2948
(2026-09-02) raised the mirror to 162 — it updated the bullet two
paragraphs up but missed this one, so the two counts on this page
disagreed for a day. It went 162 → 168 the same day, when the mirror
learned `site/index.html` entry points and stopped filing six flat static
ventures as apps with a build step. The
number moves whenever a venture's flat page count or link shape changes;
`node platform/marketing/front-door-tools.mjs --check` (no `--write`)
prints the current total without touching anything, if it drifts again.

The build half is done and was rehearsed with the exact commands the pod
runs (`PAGES_BASE_URL=https://tools.marisstella.dev/ node
platform/pages/build.mjs --out=… && node platform/pages/check.mjs
--dist=…`). Re-run on 2026-08-31 against that day's `main`: **169
products, 508 pages, no dead links**, and no `duncan-haywood.github.io`
URL surviving anywhere in the output. (The 2026-08-29 run said 164 and
446; the difference is ventures merged since, not a regression.) Nothing
about it depends on GitHub Actions (starved 2026-08-26 to 2026-09-01,
working again since — and this path never needed it either way) or on
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
site**, and as of 2026-08-31 it lands on a publicly trusted certificate
rather than a warning page.

3. ~~**The issuer flip, last.**~~ **Done 2026-08-31 — no action needed.**
   Both `gitops/prod/portfolio-site.yaml` and
   `gitops/prod/portfolio-apex.yaml` now carry
   `cert-manager.io/cluster-issuer: letsencrypt-prod`.

   This item used to say the flip came *after* step 1, once a staging
   certificate had issued. That ordering was the bug: staging is not a
   trusted root, so sealing the clone token first would have made the site
   reachable and simultaneously unusable — a browser interstitial in front
   of all 508 pages, and a handshake crawlers reject. The precondition the
   staging default was protecting (DNS for `tools.marisstella.dev`) was
   satisfied on 2026-08-29, so the flip was moved ahead of the seal.

   Nothing here is owner-only, and nothing is left to ask a session for.
   After you complete step 1, confirm the certificate with
   `kubectl -n prod get certificate` — `portfolio-site-tls` and
   `portfolio-apex-tls` should both reach `READY=True` within a minute or
   two of the pods coming up.

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

- Keep 6443 world-open until the private net (`10.10.0.10`) works, then
  flip `expose_k3s_api_publicly = false`.
- ~~What keeps serving on `marisstella.dev`. This stack will not steal it.~~
  Resolved: nothing was serving it. ingress-nginx runs `hostNetwork: true`
  on the cpx52, so it holds :80/:443 and no second listener could bind
  there; the apex resolved to the box and fell to the default backend,
  which is what issue #1925 reported. `gitops/prod/portfolio-apex.yaml`
  now claims `marisstella.dev` and `www.marisstella.dev`.

  **Updated 2026-09-02 — it no longer redirects, and no longer waits on
  the clone token.** Until then this bullet was accurate: the apex 301'd
  both names to `tools.marisstella.dev`, which serves nothing until
  `portfolio-site-repo` is sealed, so the redirect was live but led
  nowhere. It now serves `gitops/prod/portfolio-front.yaml` instead: a
  generated front-door page (positioning, one card per category, the
  §5b clauses) plus a static mirror of 174 tools at `/tools/<slug>/`, both
  held in kustomize ConfigMaps. Neither clones the repo at pod start, so
  neither needs the token, a runner, or a Pages flip — a merge to `main`
  is the deploy, same as everything else in this tree. No owner action;
  it is already live. See `gitops/README.md`'s "The public product site"
  section for the routing detail.
- Whether `duncanhaywood.dev` should get an A record for a cluster
  status host later.
- How high the isolated OpenAI hard limit should be (start low; raise
  from the dashboard, not from a key the cluster holds).
