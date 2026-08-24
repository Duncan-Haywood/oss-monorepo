# Deployment platform: one choice, and why

**Question asked (2026-08-24), sharpened three times:** if the portfolio adds
*one* platform to gain deployment capability, which one? Without risking
runaway spend — then, specifically, with a **spend cap built into the vendor**
rather than assembled from alerts and scripts, and as a best-fit-all solution
covering everything the ventures need — then, finally, judged on **best value
and most all-inclusive**. What is already wired into this repo is explicitly
not a reason.

**Answer: Railway**, on the criteria as they now stand. Hetzner wins on raw
cost and Vercel on code fit, and the sections below say exactly where each of
those wins — but only Railway is simultaneously all-inclusive and cheap.

This answer moved twice as the criteria were sharpened, so the reasoning is
kept per criterion rather than rewritten each time:

| If the criterion is | The answer is | Because |
|---|---|---|
| Lowest spend risk, $0 floor | **Cloudflare** | Free tier takes no card and stops rather than bills |
| Best fit for the code as written | **Vercel** | Seven Next.js apps, and **four ventures already carry a `vercel.json`** |
| **A spend cap built into the vendor** | **Vercel or Railway** | Only these two ship a halt-at-an-amount control |
| **Most all-inclusive** | **Railway** | The only managed platform that hosts *every* workload here |
| **Best value** | **Hetzner** | ~$5/month for all of it; the tenth app costs $0 |
| **All-inclusive + value together** | **Railway** | Hosts everything, one bill, one hard cap, ~$5–25/month |

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

## The workload inventory — and the fact that disqualifies Vercel

The earlier passes of this document counted *frameworks* and concluded Vercel,
because seven of nine apps are Next.js. Counting **workloads** instead changes
the answer, because two of them are not request/response web apps at all:

| Workload | Where | Vercel | Railway | Hetzner |
|---|---|---|---|---|
| Next.js SSR | `ai-first-markets`, `local-site-studio`, `print-atelier`, `photo-editing/docs-site`, `quick-pick-survey` | native | Node server | Node server |
| Next.js static export | `real-estate-agent-photo-app` (docs-site, research) | yes | yes | yes |
| Vite/pnpm static docs | `retail-pilot-intel`, `ai-engineering-academy` | yes | yes | yes |
| Postgres | `quick-pick-survey` (`prisma`, `POSTGRES_PRISMA_URL`) | marketplace add-on | **built in** | you install |
| **Long-running daemon + persistent volume** | `retail-pilot-intel` `analytics-sync` | **no** | yes | yes |
| **Python watchdog daemon** | `photos-import-tools` | **no** | yes | yes |
| Convex backend | `local-site-studio` | external either way | external either way | external either way |
| Swift / MonkeyC | `world-clock-widget`, `garmin-world-traveler-watchface` | store artifacts — not hosted anywhere | | |

The two bolded rows are the finding. `retail-pilot-intel/docker-compose.yml`
declares `analytics-sync` as `restart: unless-stopped` against a named volume
`pilot-data`, and `photos-import-tools` is a Python watchdog
(`photos_import_watchdog.py`, `resumable_photos_import.py`) that runs
continuously against local state. **Vercel hosts neither** — it has no
long-running processes and no persistent volumes. Choosing it means a second
platform for those two, which is precisely what "one platform, all-inclusive"
rules out.

Railway and Hetzner both host every row.

Facts that cut the other way, recorded rather than buried — and the first one
is growing:

- **Four ventures are already wired for Vercel**, up from one when this
  document was first written: `quick-pick-survey`, `local-site-studio`,
  `photo-editing/docs-site` and `retail-pilot-intel` (twice,
  `vercel.docs.json` and `apps/docs/vercel.json`). `quick-pick-survey` also
  reads `POSTGRES_PRISMA_URL` / `POSTGRES_URL_NON_POOLING` — the env var names
  Vercel Postgres injects. That is real migration work, and the trend is
  toward Vercel, not away from it. **If a fifth appears before this is
  decided, revisit the recommendation** — at some point the fit argument
  outweighs the two daemons.
- `local-site-studio` uses **Convex**, a hosted backend that is a second
  vendor whichever platform is chosen, and now carries Stripe webhook handling
  — an ordinary server route that all three platforms serve.

## The value question, with the arithmetic shown

"Value" is cost per unit of capability, so it has to be priced against *this*
portfolio: nine app-ish workloads, near-zero traffic, occasional deploys, and
no customers. All figures are approximate and unverified (see the limits
section) — the ratios are the point, not the decimals.

| | Hetzner CX22 | Railway Hobby | Vercel Pro |
|---|---|---|---|
| Monthly floor | **~$5** (€3.79 + IPv4, +20% for backups) | **$5**, and $5 of usage is included | **$20/seat** |
| Realistic monthly, this portfolio | ~$5 | ~$10–25 once nine services are always-on | $20 + Postgres + a second host for the two daemons |
| Cost of the tenth app | **$0** | metered — more RAM, more bill | $0 (same seat) |
| Postgres | you install it | **included as a service** | marketplace add-on |
| Traffic | 20 TB included | metered | generous, then metered |
| Hosts every workload here | **yes** | **yes** | **no** |

**On raw dollars, Hetzner wins and it is not close** — roughly a quarter of
Vercel's floor, for a box that runs all nine workloads plus the database, with
20 TB of traffic and a marginal app cost of zero. If "best value" means dollars
per capability, that is the answer and the rest of this section is the caveat.

The caveat is that Hetzner's price is not its cost. What comes back with the VM
is OS patching, TLS renewal, a reverse proxy, systemd units, backups you verify,
secret handling, and a public host that an unattended agent fleet pushes to.
`CLAUDE.md` is explicit that the account owner's time is the scarce resource
here — so ops hours are the expensive currency, not dollars.

That case is **weaker than it first looks**, and the reason is in this repo:
`ventures/ubuntu-agent-server/` is already an Ansible playbook with `base`,
`docker`, `nodejs` and `tailscale` roles for provisioning an Ubuntu host. Some
of the gap is closed. But read what it actually is before leaning on it — it
provisions a *LAN/tailnet agent host*, not a public web server. There is no
nginx/TLS role, no Postgres role, no app-deploy role, and its own README
installs the agent runner disabled behind a kill-switch precisely because
unattended agents on a box are treated as a deliberate decision. So it is a
head start, not a solution.

**Railway is the compromise that is actually being recommended.** It hosts
every workload including the two daemons, includes Postgres as a service
rather than an add-on, bills once, caps once, and costs a fraction of Vercel
while asking for none of Hetzner's ops hours. On "all-inclusive **and** value
together" it is the only option that scores on both.

## Runners-up, and when each would win

**Vercel** — still the best fit for the *code*, and the strongest cap control
(Spend Management pauses the project at a set amount). Seven of nine apps are
Next.js, four ventures already carry a `vercel.json`, and `next build` is the
deploy with no translation layer. It loses this question on two counts: it cannot host the two daemons at
all, so it is not the all-inclusive answer by definition; and $20/seat is four
times Railway's floor. **Choose Vercel if the Next.js apps are the only thing
that will ever be deployed** and the two daemons stay off-platform.

**Hetzner** — the best value on dollars, and the only option where adding
workloads is free. Also the strictest spend bound: a fixed price traffic cannot
move. **Choose Hetzner if ops hours are cheap for you**, or if the portfolio
ever wants one box it fully controls — the existing `ubuntu-agent-server`
Ansible roles are a real head start toward that.

**Cloudflare** — wins only on a $0 floor: free tier, no card, stops rather than
bills, unmetered static bandwidth. It is not all-inclusive (no daemons, no
Postgres, OpenNext for SSR) and its paid tier has no cap control.

## Why not the hyperscalers, restated

Neither criterion in this question rescues AWS, GCP or Azure. On **value** they
are not cheaper than Hetzner for this shape of workload once egress and
managed-service premiums are counted. On **all-inclusive** they host
everything, but "inclusive" there means a catalogue of separately-billed
services — the opposite of one bill and one cap. And they still fail the
spend-cap test outright.

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

- **The cap is a configuration, not a default.** Railway does not stop unless a
  usage limit is set. Setting it is part of granting this, not a follow-up.
- **The API token is a credential.** A Railway deploy token in repository
  secrets is used by unattended workflows; scope it to the project.
- **Nothing here ports the two daemons.** Railway *can* host
  `retail-pilot-intel`'s `analytics-sync` and `photos-import-tools`; actually
  moving them is separate work, not part of this ask.
- **`local-site-studio` still needs Convex** regardless of platform.
- **Deployment is not the binding constraint.** Per
  `portfolio/ledger/break-even.md` and `portfolio/pipeline/distribution-first.md`,
  the revenue ceiling is $0 because of distribution and the payout rail, not
  because nothing is deployed. This makes ventures publishable; it does not
  make them earn, and it adds a standing monthly cost to a portfolio earning
  nothing. The `payout-rail` row remains the only queue item that moves the
  ceiling.

## What is measured here, and what is not

**Measured.** No hosting vendor's control plane is reachable from an agent
session's own network. Every write surface — the API a deploy, a scale-up or a
teardown would call — is `egress_denied`: `api.vercel.com`,
`api.cloudflare.com`, `api.hetzner.cloud`, `management.azure.com`,
`ec2.amazonaws.com`, `api.netlify.com`, `api.fly.io`, `api.render.com`,
`api.digitalocean.com`.

```
python3 platform/deployment/probe_control_planes.py --report   # offline
python3 platform/deployment/probe_control_planes.py --check    # CI, offline
```

The verdicts are **not** kept here. They live in the portfolio's one
consolidated table, `portfolio/research/egress-reachability/prior-verdicts.json`,
which exists because nine passes once each re-probed an overlapping host set
into a different file; a second table in this directory would be the tenth.
These 20 hosts reached it through that directory's `unindexed-hosts.json`, the
designated hook for hosts measured outside the `portfolio/research/` tree, so
`consolidate.py --probe` re-measures them along with everything else. This
script only asserts the claim against that table, and a test here fails if a
results file ever reappears in this directory.

Two dashboard roots answer rather than being denied — `portal.azure.com` (200)
and `cloudresourcemanager.googleapis.com` (404). Neither is an API a deploy
calls, so neither refutes the claim, and the check treats them as context
rather than as write surfaces.

This is why the cap has to be *in the platform*. Deploys run on GitHub Actions
runners, and **no agent session can inspect, throttle, or stop one from
here.** The vendor's own halt control is the only thing that operates
unsupervised — which is precisely what the first table ranks.

**Not measured — confirm before granting.** Every price, quota and feature
claim above is from model knowledge, not first-hand: the vendor documentation
hosts are all egress-denied from this environment, so none of it could be
re-verified. Three items are load-bearing enough to check in a browser first:

1. **Railway's usage limit still hard-stops** — takes workloads offline at the
   ceiling rather than only warning — and is available on the Hobby plan.
2. **Railway's Hobby plan permits commercial use.** This one would change the
   answer most if wrong: Vercel's Hobby tier forbids it, and if Railway's does
   too, the floor becomes its Pro plan and the value gap narrows sharply.
3. Railway still bills Postgres through the same meter and the same cap.
4. Hetzner CX22 is still roughly €4/month with 20 TB of traffic, if the value
   comparison is being leaned on.

If (1) fails, the answer is Vercel. If (2) fails, it becomes a straight choice
between Vercel (fit) and Hetzner (cost). The criteria do not change either way.

## The one action

1. Create the Railway account and **set a usage limit before deploying
   anything** — the cap is the point.
2. Add a Railway deploy token as a repository secret, plus `AUTH_SECRET` for
   `ai-first-markets` and a Postgres service for `quick-pick-survey`.
3. Leave `GITHUB_PAGES_ENABLED`, `VERCEL_DEPLOY` and the `CLOUDFLARE_*` secrets
   unset.

No workflow targets Railway yet — the three that exist target Cloudflare,
GitHub Pages and Vercel. Writing one is agent-decidable work that should follow
once the account exists, not a prerequisite, and it is the honest extra cost of
this choice over Vercel, whose job is already written.

Expect `platform/ci/publish_surface.py --check` to go red once any deploy job
goes live; rewriting the snapshot is the correct follow-up, not a regression.
