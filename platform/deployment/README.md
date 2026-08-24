# Deployment platform: one choice, and why

**Question asked (2026-08-24):** if the portfolio adds *one* platform to gain
deployment capability, which one? It must be a best-fit-all solution — one
platform covering everything the ventures need — and it must have a **spend
cap built in**, not one assembled from alerts and scripts. What is already
wired into this repo is explicitly not a reason.

**Answer: Vercel.** Pro plan, with Spend Management configured to *pause* at a
set amount before the first deploy goes out.

## The criterion, stated precisely

"Spend cap built in" is a sharper test than it sounds, and it is what does the
work here. A platform passes only if the vendor ships a control that says:
*at $X, stop.* Not an alert. Not a budget you wire to a function that revokes
a policy. A first-class setting whose action is to halt service.

Most of the industry fails that test:

| Platform | Native cap that halts at an amount? | |
|---|---|---|
| **Vercel** | **Yes** — Spend Management: set an amount, action = pause the project | **passes** |
| **Railway** | **Yes** — usage limits; workloads are taken offline at the hard limit | **passes** |
| **Supabase** | Yes — a literal "Spend Cap" toggle, but it caps a *database*, not a host | partial |
| **Hetzner** | No cap *feature* — but a fixed monthly price it cannot exceed | passes differently |
| **Cloudflare** | No. Free-tier quotas stop you; the paid tier has no "stop at $X" control | fails |
| **Netlify / Render / Fly.io** | No first-class halt-at-amount control | fails |
| **AWS** | No. Budgets alert; a real cap means Budget → Lambda → deny-policy, built and owned by you | **fails** |
| **GCP** | No. Google documents budget alerts as explicitly *not* a cap; the "cap" pattern is Pub/Sub → Function → disable billing, which nukes the project | **fails** |
| **Azure** | No. The spending limit applies to credit-based subscriptions, not pay-as-you-go | **fails** |

That eliminates Google, AWS and Azure outright — not on price, on shape. They
are the only options here where the failure mode is an invoice rather than an
error page, and the cap you can build for them is itself unattended automation
that fails silently. For a portfolio whose safety argument is *no unattended
process can commit money*, that is disqualifying regardless of how small the
bill usually is.

## The fit test: what the ventures actually need

Nine venture directories, and the stack is not varied:

| Need | Where | Count |
|---|---|---|
| Next.js SSR (`next build` / `next start`) | `local-site-studio`, `print-atelier`, `photo-editing/docs-site`, `ai-first-markets`, `quick-pick-survey` | 5 |
| Next.js static export (`output: "export"`) | `real-estate-agent-photo-app` (docs-site, research) | 2 |
| Vite/pnpm static docs | `retail-pilot-intel` | 1 |
| **Postgres** (`prisma generate && next build`) | `quick-pick-survey` | 1 |
| Session auth (`AUTH_SECRET`, `ALLOWED_EMAIL`) | `ai-first-markets` | 1 |

**Seven of nine are Next.js.** That is the fit question answered before it is
asked. Vercel is the first-party Next.js platform: `next build` is the
deploy, with no adapter, no shim, no `output` mode to negotiate, and no
runtime-compatibility layer to keep working across Next releases. Every other
candidate hosts Next.js by translating it — Cloudflare through OpenNext,
Railway and Hetzner through a plain Node server, static hosts by giving up SSR
entirely. Each translation is a thing that can break on a Next.js major, and
this repo already carries an open `next@16.3.1` upgrade across five ventures.

Vercel also covers the rest without adding a vendor: monorepo projects with
path-scoped builds (which this repo needs — nine apps, one repository),
per-PR preview deployments, cron, and a Postgres for `quick-pick-survey`
through the marketplace, **billed through Vercel and therefore sitting under
the same spend cap**. That last point is what makes it a genuine one-platform
answer rather than a host plus a database bill nobody is watching.

## The cost, stated plainly

Vercel's Hobby tier is free but its terms forbid commercial use, and this is a
revenue-seeking portfolio, so the honest tier is **Pro at $20/seat/month**.
Against a portfolio with $0 revenue and a $0.12/session break-even that is a
real, recurring, non-zero commitment — the largest standing cost this
portfolio would have. It is worth saying that the platform being recommended
is the only one on the shortlist with a floor above zero.

The trade being made is: a **known** $20/month in exchange for a **bounded**
tail. Vercel's per-unit prices are high — image optimization, function
duration, bandwidth — and its surprise-bill folklore is earned. The Spend
Management pause is exactly the control that neutralizes that tail, which is
why it must be configured *before* the first production deploy, not after.

## Runners-up, and when each would win

**Railway** — the closest thing to a true all-in-one. App and Postgres are the
same platform, not a host plus an integration, and its usage limit takes
workloads offline at a hard ceiling. It costs roughly $5–20/month rather than
$20/seat. It loses on fit, not on safety: Next.js runs as a plain Node server
with no edge CDN in front, and the seven Next.js apps stop being first-class.
**Choose Railway if the $20/seat floor is the objection** — it passes the same
cap test and covers the database more cleanly.

**Hetzner** — the strictest bound on the list, because a fixed monthly price
cannot be exceeded by traffic at all. It is also the most literally all-fit: a
VM runs SSR, Postgres, cron and static from one ~€4/month box. It loses on
what comes back with the VM — OS patching, TLS renewal, reverse proxy, systemd
units, secret handling, and an internet-facing host that an unattended agent
fleet pushes to. That is a permanent operational and security liability for
ventures with zero customer contacts. **Choose Hetzner if the requirement ever
becomes long-running processes** rather than request/response apps.

**Cloudflare** — would win on a different criterion: a **$0 floor**. Its free
plan takes no payment card at signup and stops serving rather than billing
when quotas are hit, and static bandwidth is unmetered on every plan. But that
is safety by *quota*, not a spend cap, and it holds only as long as nothing
ever needs the paid tier — where no halt-at-amount control exists. It also
requires OpenNext for the SSR apps and does not include a Postgres.

## Migration cost, recorded but not weighted

Excluded from the decision by the terms of the question, and noted so the
number is not a surprise. Three deploy paths exist in `.github/workflows/`,
all inert (`python3 platform/ci/publish_surface.py` confirms nothing publishes
on a push to `main`). Two target Cloudflare; one already has a working
`deploy-vercel` job gated on `vars.VERCEL_DEPLOY`. Adopting Vercel means
porting `real-estate-agent-photo-app`'s docs deploy off `wrangler-action`, and
replacing `ai-first-markets`'s `@opennextjs/cloudflare` build with a plain
`next build` — the latter is a simplification, since the OpenNext dependency
exists only to make Next.js run somewhere it is not native.

## What this does not cover

- **The cap is a configuration, not a default.** Vercel does not pause
  spending unless Spend Management is set with pause as the action. Setting it
  is part of granting this, not a follow-up.
- **The API token is a credential.** `VERCEL_TOKEN` in repository secrets is
  used by unattended workflows; scope it to the project, not the account.
- **Deployment is not the binding constraint.** Per
  `portfolio/ledger/break-even.md` and `portfolio/pipeline/distribution-first.md`,
  the revenue ceiling is $0 because of distribution and the payout rail, not
  because nothing is deployed. This makes ventures publishable; it does not
  make them earn, and it adds $20/month to a portfolio earning nothing. The
  `payout-rail` row remains the only queue item that moves the ceiling.

## What is measured here, and what is not

**Measured.** No hosting vendor's control plane is reachable from an agent
session's own network. `probe_control_planes.py` covers 22 hosts with both a
reachable and a denied control:

```
python3 platform/deployment/probe_control_planes.py --report   # offline
python3 platform/deployment/probe_control_planes.py --check    # CI, offline
```

`api.vercel.com`, `api.cloudflare.com`, `api.hetzner.cloud`,
`management.azure.com`, `ec2.amazonaws.com` and every other write surface
probed are `egress_denied`. (Two read-only anomalies: `portal.azure.com`
answered 200, `cloudresourcemanager.googleapis.com` answered 404. Neither is a
write API.)

This is why the cap has to be *in the platform*. Deploys run on GitHub Actions
runners, and **no agent session can inspect, throttle, or stop one from
here.** The vendor's own halt control is the only thing that operates
unsupervised — which is precisely what the first table ranks.

**Not measured — confirm before granting.** Every price, quota and feature
claim above is from model knowledge, not first-hand: the vendor documentation
hosts are all egress-denied from this environment, so none of it could be
re-verified. Three items are load-bearing enough to check in a browser first:

1. Vercel Spend Management still offers **pause** (not merely notify) as the
   action at a set amount, and on the Pro plan.
2. Vercel Pro is still $20/seat/month, and Hobby still forbids commercial use.
3. Marketplace Postgres usage still bills through Vercel, so it falls under
   the same cap.

If (1) is no longer true, the recommendation changes to Railway, which passes
the same test. If (2) is the objection, the recommendation changes to Railway.
The criterion does not change either way.

## The one action

1. Create the Vercel account and **set Spend Management to pause at a chosen
   amount before deploying anything.**
2. Add repository secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`
   and repository variable `VERCEL_DEPLOY=true`, plus `AUTH_SECRET` for
   `ai-first-markets`.
3. Leave `GITHUB_PAGES_ENABLED` and the `CLOUDFLARE_*` secrets unset.

Expect `platform/ci/publish_surface.py --check` to go red afterwards: its
snapshot records `deploy-vercel` as gated, and granting this is what makes
that false. Rewriting the snapshot is the correct follow-up, not a regression.

Porting the two Cloudflare workflows is a separate, agent-decidable change
that should follow once the account exists — not a prerequisite.
