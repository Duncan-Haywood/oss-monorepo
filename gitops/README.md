# GitOps (hel1, two nodes)

One k3s cluster. Two existing Hetzner machines. Argo CD syncs this
directory after the one-time bootstrap.

```
cpx52  ubuntu-24gb-hel1-1   12 vCPU / 24 GB   control-plane
       Argo, ingress, cert-manager, prod, staging, governor CronJob

cpx22  ubuntu-4gb-hel1-1     2 vCPU /  4 GB   tainted dedicated=agents
       Codex Jobs only. maxConcurrent: 1. Hardware, not a suggestion.
```

## Does one box for prod + staging + dev make sense?

Not these two boxes treated as one. The 4 GB machine cannot hold k3s +
Argo + a Codex worker + `marisstella.dev`. The 24 GB machine can hold
the control plane and the products.

One *cluster* does make sense: same API, same Argo, namespaces `prod` /
`staging` / `agents`, AppProjects so agents cannot dest prod or read
prod Secrets, ResourceQuotas so a Job cannot eat the ingress node, and
a taint so Jobs do not schedule next to prod at all.

Split into two clusters when you need to upgrade k3s without touching
`marisstella.dev`, or when agent CPU regularly fights ingress. That is
not today's problem.

`staging` is a namespace on the same node as prod, with a smaller
quota. It is not a second copy of every product.

## Sync model

- Argo Application `root` (the snowflake) points at `gitops/apps`.
- Child Applications: platform helm charts, then `platform` / `prod` /
  `staging` / `agents`.
- Agents are CronJobs / Jobs. GitOps stores the schedule and the spec,
  not eight always-on Codex processes.
- The governor is **suspended** and `enabled: false` until you seal
  tokens and flip both knobs in git.
- A worker authenticates with **either** a metered `OPENAI_API_KEY` or a
  ChatGPT plan's `CODEX_AUTH_JSON`; the plan credential is persisted on
  the `codex-home` PVC because Codex rotates it on use. Which one to seal
  is the owner's call — `agents/secrets/README.md` lays out the
  trade-off, and `infra/OWNER_CHECKLIST.md` is the procedure.
- Every queue item's prompt is prefixed with `agents/workers/mandate.md`,
  the standing product-first brief and the floor a run may not cross. An
  item sets `delivery: agent` when its own prompt opens the PR, or leaves
  it unset to let the worker commit, push and open one.
- Budget counters live in ConfigMap `governor-state`. Argo ignores
  `/data` so a sync cannot reset the 5-hour / weekly accounting. A 429
  (worker exit 42) writes `last_limit_at` and the next ticks sleep. The
  same object holds `runs_by_item`, the per-window count `pick_item`
  divides priority by so one always-eligible item cannot take every tick —
  see `agents/queue/README.md`.

## The public product site

`prod/portfolio-site.yaml` serves the portfolio's 169 finished static
tools on **`tools.marisstella.dev`**. It is the first thing in this
cluster on a public name.

It builds the site *in the cluster* — two init containers (shallow clone,
then `platform/pages/build.mjs`) writing into an emptyDir that nginx
serves. That is deliberate: it means publishing does not depend on GitHub
Actions — which failed without a runner on every workflow in this repo
from 2026-08-26 until runners returned on 2026-09-01, and which this path
would not have needed either way — nor on GitHub Pages, which is not
enabled. Neither blocker sits in this path, and that was worth more than
usual during those five days.

A subdomain, because `tools.marisstella.dev` is the canonical host
stamped into every page's canonical link, og:url and sitemap entry. The
apex and `www` are served by `prod/portfolio-apex.yaml`, which 301s them
here rather than putting two uncanonical copies of all 518 pages in front
of crawlers.

This used to say the apex was left alone because it "already resolves to
the cpx52 for something else". It does not: `infra/README.md` records
where the A records point, not that anything answers them, and
ingress-nginx runs `hostNetwork: true` on this node, so it holds :80/:443
and nothing else can be bound there. The apex was falling to the default
backend — which is exactly what issue #1925 reported.

### What is still needed to make it live

DNS is already done: `tools.marisstella.dev` already resolves to
`89.167.29.39` (verified 2026-08-29 — `marisstella.dev`'s existing
wildcard `A/*` record already covers this subdomain, no new record
needed). **One thing remains**, and it is an owner action. Until it lands
Argo syncs the manifests and the pods crash-loop on the missing secret,
which is the intended fail-closed state.

1. **The clone token.** The repository is private, so the init container
   cannot clone anonymously. Mint a fine-grained token scoped to this one
   repository with **Contents: Read-only** and nothing else, seal it, and
   add it to `prod/kustomization.yaml` — full instructions in
   `prod/secrets/portfolio-repo-token.template.yaml`.

**The build behind that token is verified green (2026-09-01).** The one
failure mode the cache cannot cover is a *first-ever* start: with no cached
site to fall back on, a commit that fails `check.mjs` leaves the pod with
nothing to serve. So the seal is only worth spending if `main` builds
clean, and until now no session had run the pod's own command to find out.
Run outside the cluster, with the same base URL the Deployment sets:

```
PAGES_BASE_URL=https://tools.marisstella.dev/ \
  node platform/pages/build.mjs --out=/tmp/site && \
  node platform/pages/check.mjs --dist=/tmp/site
```

Both exit 0 on `main`: 169 products, 7 category pages, 518 pages, no dead
links. `build.mjs` reads the committed `launched.json` rather than shelling
out to `git log` (see the comment at its line ~4648), so the `--depth 1`
clone the `fetch` container does costs it nothing — the depth-1 checkout and
a full one produce the same site.

Re-verified same-day against a later `main`: the page count moved 517 → 518
between the two runs (another venture merged in between; the product count
held at 169). Expect this figure to keep moving by a page or two per session
— it is not the property this check exists to pin, "still exits 0" is.

This says the seal will land on a working build; it does not confirm
anything about the cluster. Certificate issuance and public reachability
remain unverified from a session — see the note at the end of this section —
because these sandboxes cannot route to `89.167.29.39` (the egress proxy
returns 403 for both hostnames, which is a sandbox limit, not a fault on
the box).

### After it is live: what happens when that token expires

A fine-grained PAT expires — 90 days is the recommended setting in
`infra/OWNER_CHECKLIST.md`. The pods build the whole site from GitHub on
every start, so an expired token used to mean no pod could start.
`maxUnavailable: 0` hid that: the running pods kept serving, the rollout
stalled, and nothing anywhere said so. The site would sit un-restartable
until the next node reboot took it to zero.

Two things now stop that, both in `prod/portfolio-site.yaml`:

- **A cache volume** (`portfolio-site-cache`) holds the last site that
  built *and* passed `check.mjs`. A pod that cannot clone, or that clones
  a commit failing `check.mjs`, restores that copy and serves it. The
  site goes stale rather than dark. Only a first-ever start with no cache
  still fails.
- **The nightly refresh CronJob waits for the rollout it triggers** and
  fails if it does not complete, or if it completes onto the cache. A
  failed `portfolio-site-refresh` Job is the signal that the site is no
  longer tracking `main`.

The live check is `https://tools.marisstella.dev/buildinfo.txt`:
`status=fresh` means the pods serving you built from `main`,
`status=stale` means they came up on the cache. It carries no commit SHA
— the repository is private and that file is not.

The fix in every stale case is the same as making it live in the first
place: re-mint the token, re-seal it, commit. Nothing else has to be
touched.

**The ACME contact is no longer on this list (changed 2026-08-30.)** It
used to be item 2: both ClusterIssuers carried
`replace-me@duncanhaywood.dev`, and replacing it was described here as an
owner action blocking TLS. It never needed to be one. An ACME account
contact is optional — RFC 8555 §7.3 makes `contact` optional and
cert-manager's `email` field follows — so
`platform/cert-manager/issuer.yaml` now ships with no `email` at all and
registers normally.

The reasoning that kept the placeholder ("which address to hand an
external certificate authority is the owner's to choose, not an agent's
to guess") still stands, and omitting the field honours it: declining to
name an address is not the same as guessing one. The placeholder itself
was the only option that satisfied nobody — it either blocks issuance
outright or files expiry warnings at a mailbox nobody reads.

What is given up is Let's Encrypt's expiry-warning email. cert-manager
renews at two-thirds of the certificate lifetime without it. If the owner
wants those warnings, adding `email:` back to both issuers is a one-line
change each that cert-manager applies by updating the existing account
registration — no reissue, no downtime, and it can happen long after the
site is live. `gitops/tests/test_manifests.py` pins the property that
matters: an address here may be real or absent, never a placeholder.

**The issuer flip is done (2026-08-31).** Both Ingresses — the site's and
the apex redirect's — now carry
`cert-manager.io/cluster-issuer: letsencrypt-prod`, and
`gitops/tests/test_manifests.py` pins prod on the site and pins the apex
equal to it.

This used to be listed here as the last step, to be done "once a staging
certificate has issued". The staging default was right while it held: Argo
syncs this namespace, so the Ingress existed before DNS for its host did,
and prod-issuer challenges that cannot resolve count against Let's Encrypt
limits for a name nobody can reach. DNS resolved on 2026-08-29, which
retired that reason.

Leaving it as a follow-up was the actual risk. Staging is not a trusted
root, so sealing `portfolio-site-repo` — the one action left — would have
published all 508 pages behind a full-page browser interstitial, live and
reaching nobody. The flip had to precede the seal, not follow it.

It is also non-worsening if issuance fails: cert-manager reissues into the
same `secretName` and leaves the existing contents alone until a new
certificate is ready, so a failed order keeps serving whatever is already
there. Failed validations cap per hour and recover on their own, and do not
consume the weekly duplicate-certificate limit, which counts only
successful issuances.

**Still unverified against the cluster:** no session has yet confirmed a
certificate actually issued for either host, because the sandboxes these
runs execute in cannot reach `89.167.29.39`. Confirm with
`kubectl -n prod get certificate` (want `READY=True` on
`portfolio-site-tls` and `portfolio-apex-tls`) or, from anywhere that can
reach the box, `curl -sSI https://tools.marisstella.dev/` without `-k`. If
prod issuance turns out to fail, the revert is `letsencrypt-staging` in
both Ingresses **and** the test — never one without the others.

### Keeping it current

Pods build from `main` at start-up, so a merged venture does not appear
until something restarts them — and Argo will not, because this manifest
does not change when a venture does. The `portfolio-site-refresh`
CronJob does a `rollout restart` nightly at 01:00 UTC, after the usage
aggregator has read the day's log (see `portfolio/usage/README.md`) — moved
there in #2330 so the restart's pod churn stops deleting nginx access logs
the aggregator hasn't read yet. Its Role is
namespaced and narrowed by resource name: it can restart this one
Deployment and touch nothing else in `prod`.

For an immediate rebuild, bump `portfolio/rebuild-nonce` on the
Deployment.

### Knowing whether anyone uses it

`prod/site-usage.yaml` is the site's usage signal, and it is the only one
there will be: every venture's own `usage.mjs` counts into the visitor's
`localStorage` and deliberately never transmits, so publishing alone would
leave every row in `portfolio/usage/usage.yaml` at `null` forever.

nginx's access log is narrowed to `$time_iso8601 $status $uri` — no client
address, user agent, referrer or query string is written at all, which is
also a fix: the stock `combined` format was logging all three on a static
site that has no account and no cookie. A CronJob reduces each day of those
lines to one integer per tool and keeps 30 days in the
`portfolio-site-usage` ConfigMap. `portfolio/usage/README.md` has the read
command and the two caveats.

## What this must not do

- Recreate k3s from Argo (that bricks the node).
- Store `HCLOUD_TOKEN` (Read or Write) in the cluster.
- Store an OpenAI Admin API key in the cluster (it can raise spend limits).
- Auto-sync agents committing to the branch they deploy from.
- Bind an Ingress to `marisstella.dev` without an explicit PR that says
  so. The name already points at the cpx52. (`tools.marisstella.dev` is
  bound, deliberately and on the record, by `prod/portfolio-site.yaml` —
  a subdomain, which cannot take traffic from the apex.)
