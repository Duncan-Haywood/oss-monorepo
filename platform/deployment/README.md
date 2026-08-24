# Deployment platform: one choice, and why

**Question asked (2026-08-24), sharpened three times:** if the portfolio adds
*one* platform to gain deployment capability, which one? Without risking
runaway spend — then, specifically, with a **spend cap built into the vendor**
rather than assembled from alerts and scripts, and as a best-fit-all solution
covering everything the ventures need — then, finally, judged on **best value
and most all-inclusive**. What is already wired into this repo is explicitly
not a reason.

**Answer: Hetzner**, on the criteria as they now stand — the question was
finally put as *"cloud power for the monorepo, if it's just one"*, and that is
a different question from *"where do the ventures deploy"*. It is the only
option that gives the repository **compute** rather than **hosting**, and it is
the answer that contains the other answers: everything Railway would run, plus
the one thing neither managed platform will.

This answer moved twice as the criteria were sharpened, so the reasoning is
kept per criterion rather than rewritten each time:

| If the criterion is | The answer is | Because |
|---|---|---|
| Lowest spend risk, $0 floor | **Cloudflare** | Free tier takes no card and stops rather than bills |
| Best fit for the code as written | **Vercel** | Seven of the ten web apps are Next.js; **four ventures carry a `vercel.json`** |
| **A spend cap built into the vendor** | **Vercel or Railway** | Only these two ship a halt-at-an-amount control |
| **Most all-inclusive** | **Railway** | The only managed platform that hosts *every* workload here |
| **Best value** | **Hetzner** | ~$5/month for all of it; the tenth workload costs $0 — but a *soft* ceiling, see below |
| **All-inclusive + value together** | **Railway** | Hosts everything deployable, one bill, one vendor-side stop, ~$5–25/month |
| **Compute for the monorepo itself** | **Hetzner** | The only one that also runs the agent host this repo has already automated |

## The criterion, stated precisely

"Spend cap built in" is a sharper test than it sounds, and it is what does the
work here. A platform passes only if the vendor ships a control whose *action*
is to halt service at an amount you set — not an alert, and not a budget you
wire to a function that revokes a policy.

**Not "at $X, stop" literally, though**, and an earlier draft of this section
overstated it. Vercel documents that usage is evaluated on a period of minutes,
so the pause lands some minutes after the threshold is crossed, and the docs
themselves advise setting the amount below the true maximum you would accept.
Railway's limit is the same shape. So what these platforms actually offer is a
**delayed automatic pause**, and the honest phrasing of the test is: does the
vendor stop the meter on its own, without you building the mechanism? That
still separates them cleanly from AWS, GCP, Azure and Hetzner, none of which
will stop anything — but it means the "hard cap" is bounded overshoot rather
than a wall, and the gap to Hetzner's soft ceiling is narrower than a
stop-versus-no-stop framing suggests.

Most of the industry fails that test:

| Platform | Native cap that halts at an amount? | |
|---|---|---|
| **Vercel** | **Yes, with lag** — Spend Management pauses the project at a set amount; usage is evaluated periodically, so expect minutes of overshoot | **passes** |
| **Railway** | **Yes, with lag** — usage limits take workloads offline at the ceiling, on the same periodic-evaluation caveat | **passes** |
| **Supabase** | Yes — a literal "Spend Cap" toggle, but it caps a *database*, not a host | partial |
| **Hetzner** | **No.** Fixed price *plus* a 20 TB traffic allowance, then metered per TB. A very high soft ceiling, not a hard one | **fails, gently** |
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
because most of the web apps are Next.js. Counting **workloads** instead
changes the answer. **This table was wrong twice and is corrected here** — see
the note below it, because both errors were in the direction that flattered the
recommendation.

| Workload | Where | Vercel | Railway | Hetzner |
|---|---|---|---|---|
| Next.js SSR (5) | `ai-first-markets`, `local-site-studio`, `print-atelier`, `photo-editing/docs-site`, `quick-pick-survey` | native | Node server | Node server |
| Next.js static export (2) | `real-estate-agent-photo-app` (docs-site, research) | yes | yes | yes |
| Static site builds (3) | `retail-pilot-intel` `apps/docs` and `apps/portal` (Vite/React), `ai-engineering-academy` (`build.mjs` + `marked`) | yes | yes | yes |
| Postgres | `quick-pick-survey` (`prisma`, `POSTGRES_PRISMA_URL`) | marketplace add-on | **built in** | you install |
| **Long-running daemon + persistent volume** | `retail-pilot-intel` `analytics-sync` | **no** | yes | yes |
| Convex backend | `local-site-studio` | external either way | external either way | external either way |
| **Not hostable anywhere** | `photos-import-tools` (macOS), `world-clock-widget` (Swift), `garmin-world-traveler-watchface` (MonkeyC) | — | — | — |

**Ten web apps plus one daemon: eleven hostable workloads.** Three further
ventures are not hosting questions at all.

The bolded daemon row is the finding. `retail-pilot-intel/docker-compose.yml`
declares `analytics-sync` as `restart: unless-stopped` against a named volume
`pilot-data`. **Vercel hosts neither long-running processes nor persistent
volumes**, so choosing it means a second platform for that workload — which is
what "one platform, all-inclusive" rules out. Railway and Hetzner both host it.

### Two corrections to this table, and they cut against the argument

Both were found in review, and both had made the case look stronger than it is:

- **`photos-import-tools` is not a hostable workload.** I filed it as a
  "Python watchdog daemon" that Vercel could not run and the other two could.
  It is macOS tooling: its README calls it "resumable **macOS** photo-import
  utilities … into **Apple Photos**", it drives Photos.app through `osascript`,
  `start_import.sh` execs `caffeinate`, and its defaults are hardcoded to
  `/Users/duncan/Library/Mobile Documents/…`. **No Linux host runs it** —
  not Hetzner, not Railway. It belongs with the Swift and MonkeyC ventures.
  Consequence: **Vercel's disqualification rests on one workload, not two.**
  That is still disqualifying for an all-inclusive criterion, but it is a
  thinner margin than this document claimed, and "Railway and Hetzner host
  every row" was false as written.
- **`retail-pilot-intel/apps/portal` was missing entirely** — a separate
  buildable Vite/React app with its own `portal:build` script. The web-app
  count was nine and is ten.

The total is still eleven hostable workloads, which is the sort of coincidence
that lets a wrong table survive a sanity check: one row left the inventory and
another joined it. The composition was wrong in both directions at once.

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
  outweighs the daemon.
- `local-site-studio` uses **Convex**, a hosted backend that is a second
  vendor whichever platform is chosen, and now carries Stripe webhook handling
  — an ordinary server route that all three platforms serve.

## The value question, with the arithmetic shown

"Value" is cost per unit of capability, so it has to be priced against *this*
portfolio: **eleven hostable workloads** — ten web apps (seven Next.js, three
static builds) plus one daemon — near-zero traffic, occasional deploys, and
no customers. Three further ventures are not hosting questions at all:
`world-clock-widget` (Swift) and `garmin-world-traveler-watchface` (MonkeyC)
build store artifacts, and `photos-import-tools` is macOS-only tooling that
drives Apple Photos on a specific Mac. No platform choice affects any of them. All figures are approximate and
unverified (see the limits
section) — the ratios are the point, not the decimals.

| | Hetzner CX22 | Railway Hobby | Vercel Pro |
|---|---|---|---|
| Monthly floor | **~$5** (€3.79 + IPv4, +20% for backups) | **$5**, and $5 of usage is included | **$20/seat** |
| Realistic monthly, this portfolio | ~$5 | ~$10–25 once a dozen services are always-on | $20 + Postgres + a second host for the daemon |
| Cost of the tenth app | **$0** | metered — more RAM, more bill | $0 (same seat) |
| Postgres | you install it | **included as a service** | marketplace add-on |
| Traffic | 20 TB included, then ~€1/TB | metered | generous, then metered |
| Hosts every workload here | **yes** | **yes** | **no** |

**On raw dollars, Hetzner wins and it is not close** — roughly a quarter of
Vercel's floor, for a box that runs all eleven workloads plus the database,
with 20 TB of traffic and a marginal app cost of zero. If "best value" means dollars
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
every hostable workload including the daemon, includes Postgres as a service
rather than an add-on, bills once, caps once, and costs a fraction of Vercel
while asking for none of Hetzner's ops hours. On "all-inclusive **and** value
together" it is the only option that scores on both.

## Why the compute reading changes the answer

Every earlier framing asked where the *ventures* deploy. "Cloud power for the
monorepo" asks something larger: what does this repository get a machine for?
And the repository has already answered that, in code, for a machine it does
not own.

`ventures/ubuntu-agent-server/` is a complete Ansible playbook for a **24/7
coding-agent host** — `base`, `docker`, `nodejs`, `tailscale`, `agent_clis`
and `agent_runner` roles, Claude Code / Codex / Antigravity / opencode
installed, a systemd timer polling every ten minutes, `unattended_upgrades`
on. It is built, it is linted, it has a `Makefile`, and its README opens by
telling you to go install Ubuntu Server on a physical box and find its LAN IP.

**That is the gap.** The portfolio has already paid the automation cost for
exactly one thing, and what it lacks is the thing to run it on. A €4 Hetzner
VPS is that thing. Vercel and Railway will never be — neither runs an agent
fleet, a systemd timer, or an SSH host, and that is not a shortcoming in them.

Two objections this document raised earlier are weaker than they looked, and
the reason is in that same playbook:

- **"You own OS patching."** `unattended_upgrades_enabled: true` is already in
  `group_vars/all.yml`, with the reboot policy exposed as a variable.
- **"A public box an unattended fleet pushes to."** Partly answered, and the
  first draft of this bullet overstated it. **Corrected after review:** the
  `tailscale` role is there, but `roles/base` also ran `ufw allow OpenSSH` with
  no source restriction and never removed it, so Tailscale added a private
  route without closing the public one. "Private by default" was false, and it
  was doing work in this argument, which is the worst place for a wrong claim.
  Public SSH is now a variable (`ssh_public_access`, default `true`). **But
  closing it is not simply "one flag on a later run"** — a second review pass
  caught that too: a GitHub-hosted runner is not on your tailnet and this
  workflow does not join it, so closing the public route also cuts CI off from
  the box. These are two coherent postures, not a sequence:

  | Posture | Provisioned by | Public SSH | 
  |---|---|---|
  | CI-provisioned | `agent-server-provision.yml` | **open** — this is the management route |
  | Tailnet-only | a machine already on the tailnet | closed |

  Pick one. The first is what this document's setup describes and leaves the
  host publicly reachable by SSH, key-only. The second is tighter and gives up
  push-button provisioning. What you cannot do is take the first and then set
  the flag, which is what an earlier draft of this bullet implied.

What is genuinely **not** automated, and is the honest cost of this choice:
there is no nginx/TLS role, no Postgres role, and no app-deploy role. Serving
the ten web apps from this box is real work that Railway would hand you free.

One thing this explicitly does **not** license. `agent_runner_start_disabled:
true` is the playbook's own default, and `CLAUDE.md` is unambiguous that
enabling unattended, spend-capable automation is always the owner's call.
Buying the box does not switch the fleet on, and no session should. The
capability arriving is the point; using it is a separate decision.

## Runners-up, and when each would win

**Vercel** — still the best fit for the *code*, and the strongest cap control
(Spend Management pauses the project at a set amount). Seven of the ten web
apps are Next.js, four ventures already carry a `vercel.json`, and `next build`
is the deploy with no translation layer. It loses this question on two counts:
it cannot host the `analytics-sync` daemon at
all, so it is not the all-inclusive answer by definition; and $20/seat is four
times Railway's floor. **Choose Vercel if the Next.js apps are the only thing
that will ever be deployed** and the daemon stays off-platform.

**Railway** — the answer if the question is only *where do the ventures
deploy*, and the right choice for anyone who would rather never touch a
server. It hosts every deployable workload including the daemon, includes
Postgres as a service, bills once and caps once. It loses here only because it
cannot be the monorepo's compute: no agent host, no SSH, no systemd. **Choose
Railway if the agent fleet is never going to move off GitHub Actions** and the
ops hours matter more than the four-times cost difference.

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

- **There is no cap, and this option cannot give you one.** Corrected after
  review: an earlier draft of this document claimed a fixed monthly price that
  traffic could not move, and that is false. Hetzner includes a traffic
  allowance — 20 TB on the EU CX line — and bills roughly €1/TB beyond it, with
  no vendor-side control that halts at an amount. So Hetzner **fails** the
  spend-cap test that eliminated AWS, GCP and Azure. It fails it far more
  gently: the overage rate is cents per gigabyte against their unbounded
  metering, and the first 20 TB are free, so a runaway here is tens of euros
  rather than a story. But "nothing to cap" was wrong, and anyone choosing this
  is choosing a **soft** ceiling. If a hard one is required, that is Railway.
- **Serving the web apps is not included.** No nginx/TLS role, no Postgres
  role, no app-deploy role. That is real follow-on work, and Railway would
  have given it away.
- **Nothing here ports the daemon.** The box *can* run `retail-pilot-intel`'s
  `analytics-sync`; actually moving it is separate work, not part of this ask.
  `photos-import-tools` is macOS-only and is not a candidate for any host.
- **SSH and root are credentials, and the box is not Tailscale-only.** A box CI
  can deploy to is a box a compromised token can reach. An earlier draft said
  Tailscale-only access "is the mitigation the playbook already sets up" — it
  is not: `ssh_public_access` defaults to `true`, so an ordinary provisioning
  run leaves OpenSSH reachable from the internet, key-only, and that is the
  route CI itself uses. Tailscale-only is the *other* posture described above,
  and it costs push-button provisioning. Whichever you pick, the mitigation
  that actually holds is the box being disposable.
- **`local-site-studio` still needs Convex** regardless of platform.
- **Deployment is not the binding constraint.** Per
  `portfolio/ledger/break-even.md` and `portfolio/pipeline/distribution-first.md`,
  the revenue ceiling is $0 because of distribution and the payout rail, not
  because nothing is deployed. This makes ventures publishable; it does not
  make them earn, and it adds a standing monthly cost to a portfolio earning
  nothing — the smallest such cost on the shortlist, but not zero. The
  `payout-rail` row remains the only queue item that moves the
  ceiling.

## What is measured here, and what is not

**Measured, with one exception that is stated up front rather than buried.**
Ten of the eleven vendor write surfaces — the API a deploy, a scale-up or a
teardown would call — are `egress_denied` from an agent session:
`backboard.railway.app`, `api.vercel.com`, `api.cloudflare.com`,
`api.hetzner.cloud`, `management.azure.com`, `ec2.amazonaws.com`,
`api.netlify.com`, `api.fly.io`, `api.render.com`, `api.digitalocean.com`.

**The eleventh answers.** `cloudresourcemanager.googleapis.com` is reachable,
and it is a write API — details below. So the claim this section supports is
"a session cannot reach *these* control planes", not "a session cannot reach
any", and `check()` enforces exactly that narrower statement.

```
python3 platform/deployment/probe_control_planes.py --report   # offline
python3 platform/deployment/probe_control_planes.py --check    # CI, offline
```

The verdicts are **not** kept here. They live in the portfolio's one
consolidated table, `portfolio/research/egress-reachability/prior-verdicts.json`,
which exists because nine passes once each re-probed an overlapping host set
into a different file; a second table in this directory would be the tenth.
These 23 hosts reached it through that directory's `unindexed-hosts.json`, the
designated hook for hosts measured outside the `portfolio/research/` tree, so
`consolidate.py --probe` re-measures them along with everything else. This
script only asserts the claim against that table, and a test here fails if a
results file ever reappears in this directory.

**One measured exception, and it is a write API.** Corrected after review:
`cloudresourcemanager.googleapis.com` answers 404, and it is Google Cloud's
Resource Manager — `projects.create`, `projects.delete`, `setIamPolicy`, not a
dashboard. An earlier draft filed it under "context", where its reachability
could not fail the claim — the same bucket-shuffle that had left Railway out of
the load-bearing set entirely. It is a write surface now, carried as an
explicit exception with its reason, and the check fails both if anything else
becomes reachable *and* if this one goes quiet. The accurate claim is therefore
not "every vendor control plane is unreachable" but "every one probed except
GCP's Resource Manager". Reaching it would still need a credential, and GCP
stays disqualified on the absence of a native spend cap, not on reachability.

`portal.azure.com` (200) is genuinely a dashboard root and stays context.

This is why the cap has to be *in the platform*. Deploys run on GitHub Actions
runners, and **no agent session can inspect, throttle, or stop one from
here.** The vendor's own halt control is the only thing that operates
unsupervised — which is precisely what the first table ranks.

**Not measured — confirm before granting.** Every price, quota and feature
claim above is from model knowledge, not first-hand: the vendor documentation
hosts are all egress-denied from this environment, so none of it could be
re-verified. Four items are load-bearing enough to check in a browser first:

1. **Hetzner CX22 is still roughly €4/month with 20 TB of traffic included**,
   and IPv4 is still a small monthly add-on rather than a surprise. This is the
   load-bearing one: the whole value argument is the four-times gap against
   Vercel's floor.
2. **Hetzner still bills traffic beyond the 20 TB allowance at roughly €1/TB,
   with no halt-at-an-amount control** — if the overage rate has jumped, or
   compute has become usage-billed, the soft-ceiling case fails and Railway's
   vendor-side stop becomes the safer shape, overshoot lag and all.
3. Hetzner signup still needs only a payment method, with no business-entity
   requirement for an individual account.
4. If the fallback is being weighed: Railway's usage limit still takes
   workloads offline on its own (with the periodic-evaluation lag noted
   above — it is not instantaneous), and its Hobby plan permits commercial use
   where Vercel's forbids it. The overshoot window is itself unverified from
   here; Vercel publishes theirs, Railway's is assumed to be similar.

If (2) fails, the answer is Railway. If the ops work in step 3 of the action
below is unwelcome, the answer is Railway. The criteria do not change either
way — and note that this is now the *fourth* framing of the question, so the
per-criterion table at the top is the durable artifact here, not any single
recommendation.

## The one action

1. Create the Hetzner account and take one CX-class VPS (~€4/month, 20 TB
   traffic). Fixed monthly price, with the traffic caveat below — there is no
   vendor-side stop to configure, because Hetzner does not offer one.
2. Point `ventures/ubuntu-agent-server/inventory.ini` at it and run the
   playbook, over the box's public IP. **Keep using the public address**: the
   CI-provisioned posture needs it, because a GitHub runner is not on your
   tailnet. Switching to a Tailscale address is the other posture, and it means
   running the playbook by hand from a tailnet machine instead.
3. Leave `agent_runner_start_disabled: true`. Turning the fleet on is a
   separate decision and this is not it.
4. Leave `GITHUB_PAGES_ENABLED`, `VERCEL_DEPLOY` and the `CLOUDFLARE_*`
   secrets unset.
5. **Do not put a Hetzner Cloud API token in GitHub secrets** — an SSH key
   for the box is the credential CI wants, and it cannot create servers. See
   below for the split and the setup.

### The credential this does *not* want

The other three candidates are configured by putting a vendor token in
repository secrets, so that is the reflex this option invites. It is wrong
here, and wrong in a way that removes the reason for choosing Hetzner at all.

A Hetzner Cloud API token is an **infrastructure control plane**, not a deploy
credential. Read & Write on a project means create and destroy servers,
volumes, snapshots, floating IPs, firewalls and load balancers — and Hetzner
offers only *Read* or *Read & Write* per project, with no finer scoping, so
there is no least-privilege version of it to reach for.

That breaks the argument this whole section rests on. Hetzner was chosen
because its spend exposure is small and slow-moving — a fixed monthly price
plus a traffic allowance no zero-customer portfolio will approach. A read-write
Cloud token can provision more servers, so the bound stops being "one box" and
becomes "whatever the project quota allows". The remaining bound — one box,
not a project quota — is the property such a token removes.

The blast radius is not hypothetical in this repository. The fleet workflow
runs with `contents: write`, and `agent-permission-harness` measures its agent
reading **121 repository files** — every one `REPO_WRITE` — while holding
secrets. A workflow only receives the secrets it names, but anything with
`contents: write` can add the line that names one, and `CLAUDE.md` already
records a session merging a change against that pull request's own stated
intent. A credential that can bill an account should not sit one workflow edit
away from an unattended agent.

Nothing needs it anyway:

- **Provisioning is a one-time human action.** Create the box in the console,
  or with `hcloud` from your own machine using a token that never leaves it.
- **Configuration is SSH, not the Cloud API.** `ubuntu-agent-server` reaches
  the box over SSH and Tailscale; it never calls Hetzner's API.
- **If CI ever deploys**, what it wants is an SSH key for a restricted deploy
  user on that one box — a credential whose worst case is that one box —
  never a token that can create more of them.

If such a token has already been added, revoke it in the Hetzner console
rather than deleting the GitHub secret alone: deletion removes the copy, not
the credential.

### The SSH key, done properly

**Decided 2026-08-24: the box belongs to the repository, not to a person, and
its key lives in GitHub secrets.** That reverses the "keep it on your machine"
posture an earlier draft of this section took, and the reasoning behind the
reversal is sound: the objection to the Hetzner *API token* was that it can
create servers, which turns a fixed price into an open one. **An SSH key cannot
provision anything.** The remaining one-box bound survives a key in CI intact,
so that objection does not transfer.

What does transfer is a smaller and more specific risk, worth naming once and
then designing around rather than worrying about: the key is **access**, and
what it eventually reaches is not an empty box. Once someone logs the agent
CLIs in — which is the point of `ubuntu-agent-server` — that machine holds
live Claude Code, Codex and opencode sessions. A deploy key in a repository an
unattended fleet can write to is one workflow edit away from those.

The design that makes the owner's framing true rather than merely hopeful:

- **The box is cattle.** It holds no credential that is not recoverable by
  rebuilding it, and rebuilding it costs €4 and a playbook run. Nothing
  irreplaceable — no payout rail, no domain control, no personal key — ever
  lands on it.
- **The key is used for nothing else** — dedicated pair, no passphrase (CI
  cannot type one), reaching one account on one host. But **that account is
  root-equivalent**, and an earlier draft's "one unprivileged account" was
  wrong: the same public key is what you paste into the Hetzner console, so it
  lands in `root`'s `authorized_keys`; the workflow connects as `root` by
  default because a fresh image has nobody else; and the managed account is
  given `NOPASSWD:ALL` so unattended Ansible can work at all. Any one of those
  three makes a stolen deploy key root on that box. Narrowing the sudo rule is
  not realistic for a playbook that installs packages and manages systemd
  units, so **the boundary is the box, not the account** — which is exactly why
  the cattle property below is doing the load-bearing work rather than
  decorating it.
- **The API token is still a no.** Provision the server in the Hetzner console
  by hand. Nothing in CI needs to create servers, and the moment something can,
  the one-box bound is gone.
- **The fleet stays off, with no switch here at all.** The provisioning
  workflow pins `agent_runner_start_disabled=true` and exposes no input to
  override it. An earlier draft had a boolean for it and this bullet still
  described that — both wrong: `workflow_dispatch` is not an owner-only
  boundary, so the input was a route *around* the gate `CLAUDE.md` reserves to
  the account owner. Starting the fleet needs a hand-run playbook or its own
  owner-gated mechanism. Owning a box and running a fleet on it are two
  decisions and this document only makes the first.

`.github/workflows/agent-server-provision.yml` implements this. It is
`workflow_dispatch`-only — a button, not a trigger — and refuses to start with
a clear list of what is missing rather than half-configuring a box.
`platform/ci/publish_surface.py` classifies it
as publishing nothing, which is accurate: no push trigger reaches it.

Two gaps in `ubuntu-agent-server` had to be closed for any of this to run at
all, and both were invisible until CI was the operator:

1. **The playbook never created `agent_user`.** It was written for a box whose
   Ubuntu installer had already made the account; a cloud image has only root,
   so the first `authorized_key` task would have failed against a user that did
   not exist.
2. **`--ask-become-pass` has no answer on a runner.** Passwordless sudo is now
   a variable, default `false` so a hand-run playbook does not silently hand out
   NOPASSWD, set `true` by the workflow. The sudoers drop-in is written with
   `validate: visudo -cf %s`, because a malformed sudoers file locks every
   account out of sudo and on an SSH-only box that is unrecoverable.

Set up, in order:

**Create the protected Environment first.** This is not optional ordering, and
review caught the earlier instructions getting it wrong: they used
`gh secret set`, which stores a *repository* secret. A write-access
collaborator can then push a branch that deletes the `environment:` line and
dispatch it — the edited workflow still reads a repository secret, and the
required-reviewer gate never runs. **An environment-scoped secret is the thing
that cannot be reached that way.** In Settings → Environments, create
`agent-server` with the account owner as a required reviewer. Then:

```bash
ssh-keygen -t ed25519 -N "" -C "agent-server ci" -f /tmp/agent-ci
gh secret   set AGENT_SERVER_SSH_KEY --env agent-server < /tmp/agent-ci
gh variable set AGENT_SERVER_PUBKEY  --env agent-server < /tmp/agent-ci.pub
gh variable set AGENT_SERVER_HOST --body "<box ip>"
shred -u /tmp/agent-ci /tmp/agent-ci.pub
```

`AGENT_SERVER_KNOWN_HOSTS` and `TAILSCALE_AUTHKEY` go in the same environment,
for the same reason — both reach the box.

**The public key goes there too, and that is not obvious.** It is not a secret,
so an earlier draft set it as a plain repository variable and said so in a
comment. Review caught the flaw: whoever can set that variable decides which
key the playbook installs into `authorized_keys` on a root-equivalent account.
A write-access collaborator could point it at their own key and let a
routine-looking environment approval install it — a bypass that goes *through*
the gate rather than around it, and one the approver has no way to see. The
lesson generalises: **confidentiality and integrity are different questions,
and only the first is about secrecy.** Anything that decides who gets access
belongs behind the same gate as the credentials, secret or not.

Piping straight into `gh` keeps the private key off your screen, out of your
shell history and out of any transcript. Create the server in the Hetzner
console first, pasting the same public key so the box comes up reachable.

Then pin the host key **before the first run**, reading the fingerprint from
the Hetzner console rather than from the network:

```bash
gh secret set AGENT_SERVER_KNOWN_HOSTS --env agent-server \
  --body "<host> ssh-ed25519 AAAA..."
```

The workflow refuses to start without it, and that is deliberate. An earlier
draft fell back to `accept-new` and pinned afterwards — but the first run is
the one that may hand `TAILSCALE_AUTHKEY` to whatever answered, and a key
pinned later cannot authenticate a connection already made.

Two accounts are involved and they are not the same one. `AGENT_SERVER_SSH_USER`
is the login used to *connect*, and it must already exist — on a fresh cloud
image that is `root`, which is the default. `AGENT_SERVER_AGENT_USER` is the
non-root account the playbook *creates* and the agents run as, defaulting to
`deploy` — non-root, not unprivileged, since it carries NOPASSWD sudo.
Conflating the two either cannot connect or installs the entire agent stack as
root.

One limitation worth knowing before you press the button: the workflow's dry-run
option cannot validate a *fresh* box. Ansible's `user` module only predicts the
account in check mode, so every later task targeting it fails against a user
that does not exist. `--check` is for re-runs against a box that is already up;
the first run has to be a real one.

Expect `platform/ci/publish_surface.py --check` to go red once any deploy job
goes live; rewriting the snapshot is the correct follow-up, not a regression.
