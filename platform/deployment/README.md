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
| Best fit for the code as written | **Vercel** | Seven of the nine web apps are Next.js; **four ventures carry a `vercel.json`** |
| **A spend cap built into the vendor** | **Vercel or Railway** | Only these two ship a halt-at-an-amount control |
| **Most all-inclusive** | **Railway** | The only managed platform that hosts *every* workload here |
| **Best value** | **Hetzner** | ~$5/month for all of it; the tenth app costs $0 |
| **All-inclusive + value together** | **Railway** | Hosts everything deployable, one bill, one hard cap, ~$5–25/month |
| **Compute for the monorepo itself** | **Hetzner** | The only one that also runs the agent host this repo has already automated |

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
because seven of the nine *web apps* are Next.js. Counting **workloads**
instead changes the answer, because the portfolio also has two that are not
request/response web apps at all:

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
portfolio: **eleven hostable workloads** — nine web apps (seven Next.js, two
static docs sites) plus the two daemons — near-zero traffic, occasional
deploys, and no customers. Two more ventures (`world-clock-widget`,
`garmin-world-traveler-watchface`) build store artifacts and are not hosted
anywhere, so no platform choice affects them. All figures are approximate and unverified (see the limits
section) — the ratios are the point, not the decimals.

| | Hetzner CX22 | Railway Hobby | Vercel Pro |
|---|---|---|---|
| Monthly floor | **~$5** (€3.79 + IPv4, +20% for backups) | **$5**, and $5 of usage is included | **$20/seat** |
| Realistic monthly, this portfolio | ~$5 | ~$10–25 once a dozen services are always-on | $20 + Postgres + a second host for the two daemons |
| Cost of the tenth app | **$0** | metered — more RAM, more bill | $0 (same seat) |
| Postgres | you install it | **included as a service** | marketplace add-on |
| Traffic | 20 TB included | metered | generous, then metered |
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
every workload including the two daemons, includes Postgres as a service
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
- **"A public box an unattended fleet pushes to."** The `tailscale` role is
  already there and the README's whole bootstrap sequence is *get on the
  tailnet, then stop using the public address.* The box is private by default;
  a site is public only when you choose to publish one. That is a materially
  smaller surface than "a public web server", which is how the earlier
  Hetzner section framed it.

What is genuinely **not** automated, and is the honest cost of this choice:
there is no nginx/TLS role, no Postgres role, and no app-deploy role. Serving
the nine web apps from this box is real work that Railway would hand you free.

One thing this explicitly does **not** license. `agent_runner_start_disabled:
true` is the playbook's own default, and `CLAUDE.md` is unambiguous that
enabling unattended, spend-capable automation is always the owner's call.
Buying the box does not switch the fleet on, and no session should. The
capability arriving is the point; using it is a separate decision.

## Runners-up, and when each would win

**Vercel** — still the best fit for the *code*, and the strongest cap control
(Spend Management pauses the project at a set amount). Seven of the nine web
apps are Next.js, four ventures already carry a `vercel.json`, and `next build`
is the deploy with no translation layer. It loses this question on two counts: it cannot host the two daemons at
all, so it is not the all-inclusive answer by definition; and $20/seat is four
times Railway's floor. **Choose Vercel if the Next.js apps are the only thing
that will ever be deployed** and the two daemons stay off-platform.

**Railway** — the answer if the question is only *where do the ventures
deploy*, and the right choice for anyone who would rather never touch a
server. It hosts every deployable workload including the two daemons, includes
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

- **No cap is needed, and that is the point.** A fixed monthly price cannot be
  exceeded by traffic, so there is no spend control to configure and none to
  forget. This is the only option on the shortlist where the bound is a
  property of the product rather than a setting.
- **Serving the web apps is not included.** No nginx/TLS role, no Postgres
  role, no app-deploy role. That is real follow-on work, and Railway would
  have given it away.
- **Nothing here ports the two daemons.** The box *can* run
  `retail-pilot-intel`'s `analytics-sync` and `photos-import-tools`; actually
  moving them is separate work, not part of this ask.
- **SSH and root are credentials.** A box the fleet can deploy to is a box a
  compromised token can reach. Tailscale-only access is the mitigation the
  playbook already sets up, and it should stay that way.
- **`local-site-studio` still needs Convex** regardless of platform.
- **Deployment is not the binding constraint.** Per
  `portfolio/ledger/break-even.md` and `portfolio/pipeline/distribution-first.md`,
  the revenue ceiling is $0 because of distribution and the payout rail, not
  because nothing is deployed. This makes ventures publishable; it does not
  make them earn, and it adds a standing monthly cost to a portfolio earning
  nothing — the smallest such cost on the shortlist, but not zero. The `payout-rail` row remains the only queue item that moves the
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
re-verified. Four items are load-bearing enough to check in a browser first:

1. **Hetzner CX22 is still roughly €4/month with 20 TB of traffic included**,
   and IPv4 is still a small monthly add-on rather than a surprise. This is the
   load-bearing one: the whole value argument is the four-times gap against
   Vercel's floor.
2. **Hetzner still bills a fixed monthly price with no metered compute** — if
   any part of the plan has become usage-billed, the "no cap needed" claim
   fails and Railway's hard limit becomes the safer shape.
3. Hetzner signup still needs only a payment method, with no business-entity
   requirement for an individual account.
4. If the fallback is being weighed: Railway's usage limit still hard-stops,
   and its Hobby plan permits commercial use (Vercel's forbids it).

If (2) fails, the answer is Railway. If the ops work in step 3 of the action
below is unwelcome, the answer is Railway. The criteria do not change either
way — and note that this is now the *fourth* framing of the question, so the
per-criterion table at the top is the durable artifact here, not any single
recommendation.

## The one action

1. Create the Hetzner account and take one CX-class VPS (~€4/month, 20 TB
   traffic). Fixed price; nothing to cap, because nothing meters.
2. Point `ventures/ubuntu-agent-server/inventory.ini` at it and run the
   playbook — public IP for the bootstrap run, Tailscale address thereafter,
   exactly as that README already documents.
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
because the spend bound is **structural** — a fixed monthly price that traffic
cannot move, needing no cap to configure and none to forget. A read-write
Cloud token can provision more servers, so the bound stops being "one box" and
becomes "whatever the project quota allows". The one property that made this
option safe without a cap feature is the property such a token removes.

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
provision anything.** The structural spend bound this option was chosen for
survives a key in CI intact, so that objection does not transfer.

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
- **The key is used for nothing else.** Dedicated pair, no passphrase (CI
  cannot type one), reaching one unprivileged account on one host.
- **The API token is still a no.** Provision the server in the Hetzner console
  by hand. Nothing in CI needs to create servers, and the moment something can,
  the fixed-price argument is gone.
- **The fleet stays off.** `agent_runner_start_disabled` is true unless a human
  flips the workflow input, because `CLAUDE.md` reserves unattended spend-capable
  automation to the owner. Owning a box and running a fleet on it are two
  decisions and this document only makes the first.

`.github/workflows/agent-server-provision.yml` implements this. It is
`workflow_dispatch`-only — a button, not a trigger — and refuses to start with
a clear list of what is missing rather than half-configuring a box. `platform/ci/publish_surface.py` classifies it
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

```bash
ssh-keygen -t ed25519 -N "" -C "agent-server ci" -f /tmp/agent-ci
gh secret   set AGENT_SERVER_SSH_KEY < /tmp/agent-ci    # private half, never on screen
gh variable set AGENT_SERVER_PUBKEY  < /tmp/agent-ci.pub
gh variable set AGENT_SERVER_HOST --body "<box ip>"
shred -u /tmp/agent-ci /tmp/agent-ci.pub
```

Piping straight into `gh` keeps the private key off your screen, out of your
shell history and out of any transcript. Create the server in the Hetzner
console first, pasting the same public key so the box comes up reachable.

Then pin the host key **before the first run**, reading the fingerprint from
the Hetzner console rather than from the network:

```bash
gh secret set AGENT_SERVER_KNOWN_HOSTS --body "<host> ssh-ed25519 AAAA..."
```

The workflow refuses to start without it, and that is deliberate. An earlier
draft fell back to `accept-new` and pinned afterwards — but the first run is
the one that may hand `TAILSCALE_AUTHKEY` to whatever answered, and a key
pinned later cannot authenticate a connection already made.

Two accounts are involved and they are not the same one. `AGENT_SERVER_SSH_USER`
is the login used to *connect*, and it must already exist — on a fresh cloud
image that is `root`, which is the default. `AGENT_SERVER_AGENT_USER` is the
unprivileged account the playbook *creates* and the agents run as, defaulting
to `deploy`. Conflating them either cannot connect or installs the entire agent
stack as root.

One limitation worth knowing before you press the button: the workflow's dry-run
option cannot validate a *fresh* box. Ansible's `user` module only predicts the
account in check mode, so every later task targeting it fails against a user
that does not exist. `--check` is for re-runs against a box that is already up;
the first run has to be a real one.

Expect `platform/ci/publish_surface.py --check` to go red once any deploy job
goes live; rewriting the snapshot is the correct follow-up, not a regression.
