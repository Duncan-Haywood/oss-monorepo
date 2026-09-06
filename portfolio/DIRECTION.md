# Company direction

**Effective 2026-08-24.** This is the portfolio's operating strategy. When
instructions conflict, this document wins over older prose in `CLAUDE.md`, the
ledger, or session notes that still treat policy compliance as the primary job.

Two companion documents carry the parts this one only names:

- [`PRODUCT_PLAYBOOK.md`](../PRODUCT_PLAYBOOK.md) — how to actually build one of
    these products in a session: picking the niche, product shapes that cost $0
    per user, the API-key switch, the disclaimer text to copy, the SEO/AI-discovery
    checklist, and the definition of done.
- [`portfolio/hosting/`](hosting/README.md) — where a product goes live:
    GitHub Pages for static tools, the existing Hetzner boxes for
    processes. Not Cloudflare. Not Vercel.
- [`portfolio/usage/`](usage/README.md) — what may be counted (events, never
  people), which free signals already exist, and where readings land
  (`usage/usage.yaml`) so the next session and the router can see them.

## What we are doing

Build software products that create large amounts of value for real users.
Target super-niche markets where people have money and a concrete problem —
especially problems that help them earn more money. Ship traditional software;
add AI only where it clearly improves the product, not as a wrapper.

The starting point is **abundant free value**: full-feature products at no
charge while we learn what people actually use. Measure that with **usage
stats** (signups, active use, return visits, feature adoption, referral
traffic). What people come back to without paid acquisition is what we double
down on.

Revenue comes later. For now:

- Do **not** collect payment or wire payout rails.
- **Do** keep liability-limiting disclaimers in every user-facing product
  (see "Legal guardrails" below).
- **Do** add GitHub Sponsors or a donation link where it fits — optional
  support, not a paywall.

## Current priority: deploy what is already built

> **Superseded 2026-09-06: the primary deploy is done, confirmed serving, and
> current.** Everything in this section was written between 2026-08-25 and
> 2026-09-02 on the premise that no built product had a public URL that
> mattered. That premise is now false. `python3 platform/ci/pages_state.py`
> reports `deployed: served` — GitHub's own managed builder ran the
> `gh-pages` branch (run 34013011002, 2026-09-06T05:03:36Z) — and
> `current` — the snapshot was built from `main`'s own tip (`d5f6709f`), not
> a stale commit. `deploy-settings` is granted. All ~175 finished products
> are reachable today at
> `https://duncan-haywood.github.io/monorepo-projects/`, no owner action
> pending. Stop naming that flip as a blocker and stop reading a built
> product with no *second* URL as undeployed.
>
> What is **not** fixed by the above: the separate `marisstella.dev` /
> Hetzner k3s route is still down (`CLAUDE.md`'s outage block has the
> measurements) and its recovery is a real owner action
> (`hetzner-ssh-key-is-a-public-key`, #3184) — a local SSH/Argo restore, not
> a Pages setting. Don't conflate the two: a session that reads "the
> catalogue is dark" from that block and reads no further will re-derive
> the deploy-first urgency this note just retired. The Pages route needs
> nothing further to keep serving *except* the standing job below.
>
> The standing job that survives this correction: **a committed branch does
> not rebuild itself.** After any merge touching a served surface
> (`ventures/**`, `platform/pages/**`, `platform/marketing/**`), run
> `python3 platform/ci/pages_state.py`; if it reports `stale`, run
> `CONFIRM=publish-pages-branch PUSH=1 ./platform/pages/publish-branch.sh`.
> That is now the only thing standing between `main` and what a stranger
> sees.
>
> Read the rest of this section for *why* deploy-first was the right call
> while it was true — the reasoning generalizes to the next channel that
> isn't live yet. Then read
> "[What changes now that distribution is solved](#what-changes-now-that-distribution-is-solved)"
> below for what replaces it as the fleet's default job.

A product that only exists as `index.html` in this repo is not yet a product
people use. As of 2026-08-25 a cluster of calculators and CLIs is on `main`
(seller-fee tools, trade bids, quote-margin, retainage, e-invoice preflight,
and others) and **none of them have a public URL**. Every usage reading is
still a zero baseline. `python3 platform/ci/publish_surface.py` still
reports nothing live on a push to `main`.

That tool reads `gitops/` as well as the workflows since 2026-08-31, so
"nothing live" was a statement about both delivery paths rather than only
the one this paragraph was written about.

**Half of it stopped being true on 2026-09-02 (#2723).** `marisstella.dev`
and `www.marisstella.dev` had answered on merge since 2026-08-28, but only
as annotation-only 301s into `tools.marisstella.dev` — the host that serves
the 169 tools and fails closed on the unsealed Secret
`portfolio-site-repo`. Two hosts answering, nobody reaching content. Those
two names now serve a generated front-door page from a kustomize ConfigMap
(`gitops/prod/portfolio-front.yaml`), which needs no clone token, no
Actions runner and no Pages flip, so it deploys on merge with no owner
action at all. `publish_surface.py --check` reports **2 hostnames serving
content**.

What has not changed: the catalogue is still behind the seal.
`./bootstrap/scripts/seal-owner-secrets.sh site` is what makes the front
door's category links land on the tools they describe, and it remains the
highest-value owner action in the queue.

Until the already-built catalogue is reachable by a stranger, **deploy
beats another build**:

1. Get a live URL (or install command) in front of a niche user.
2. Record a usage reading that is not `null`.
3. Only then graduate a new candidate or clone another bid calculator.

The host is decided: GitHub Pages for static products, the existing
Hetzner boxes for processes — see [`hosting/README.md`](hosting/README.md).
The remaining owner flip is `deploy-settings` (enable GitHub Pages). Do
not open a second platform ask, and do not add Cloudflare or Vercel as
the way a product goes live. Agents prepare the deploy artifact; they
do not register a domain, store listing, or npm publish. Building
privately remains allowed. Cloning a twelfth undeployed calculator is
not.

**The artifact is prepared** (2026-08-26).
[`platform/pages/`](../platform/pages/README.md) assembles every static venture
surface — 33 tools at the time of writing — into the one Pages site this
repository gets, and `.github/workflows/portfolio-pages.yml` builds and tests it
on every push to `main`. Until then, the flip would have published only
`retail-pilot-intel`'s passcode-gated docs and left every calculator dark, so it
was worth far less than the queue implied; that workflow now reads its own
variable rather than racing for the origin. Two consequences for a session
picking work:

- **Nothing further is needed to publish.** A new calculator is discovered
  automatically on the next push — no manifest to update, no per-venture deploy
  workflow to write. If a venture must stay private, add its slug to
  `EXCLUDED_SLUGS` with a reason.
- **The deploy half of deploy-first is done.** What is still missing is the
  owner flip, and nothing an agent builds changes that. So the next unit of
  work is making the tools that will go live better — depth, correctness,
  onboarding, discoverability — not a thirty-fourth front page.

## What changes now that distribution is solved

Distribution was the fleet's bottleneck for two weeks and consumed most of
the direction-setting prose above. It no longer is: 175 products are one
click away from any stranger, indexed, and the deploy-and-forget loop
(`pages_state.py` → `publish-branch.sh`) closes it in under a minute. That
changes what "the next task" means. In order:

1. **Keep the snapshot current.** One command, above. Do this before
   anything else on a session that touched a served surface — a stale
   snapshot is a live regression nobody's CI will catch, because CI checks
   `main`, not the branch a visitor actually gets.
2. **Read `portfolio/usage/usage.yaml` before picking work.** As of
   2026-09-02 it recorded zero observed users across every one of ~184
   products — the fleet spent August building depth into calculators nobody
   had yet been able to reach. That excuse is gone. **Any product with a
   nonzero signal — a real visitor, a return visit, a completed export —
   now outranks every other candidate for this session's time.** Go make
   that one product better: fix the friction its actual visitor hit, not
   the friction a hypothetical one might.
3. **A product that has had a fair run and stayed at zero is not the next
   place to add a comparison page.** "Fair run" here means: live and
   reachable from the apex catalogue's own index/sitemap for a couple of
   weeks, discoverable in its niche search terms per the checklist in
   `PRODUCT_PLAYBOOK.md` §5e. If those are true and `usage.yaml`'s trend
   line for it is still flat zero, say so in one ledger line (the pattern
   `usage/README.md` already asks for — "listed for two weeks, still zero,
   stopping work on it") and spend the session elsewhere. This is not
   deletion: the product stays live, free, and disclaimed. It just stops
   being where build time goes until something changes the picture — a new
   channel, a rescoring, an actual piece of inbound interest. Ventures
   whose `VENTURE.yaml` carries a `stage` at or past `revenue` with $0 MRR
   already surface this in `python3 portfolio/router/allocate.py`'s review
   list — check a venture's own `kill_criteria` there before deciding
   whether "stop adding features" should become "stop routing this venture
   any budget at all."
4. **Only then does a new venture compete for the same time.** New ventures
   are still wanted — they are how the portfolio finds the business that
   actually works, and a catalogue of untested calculators proves nothing
   on its own. But "graduate a new candidate" is not free just because
   distribution is solved: prefer a `build-now` candidate from
   `portfolio/pipeline/` that already clears both gates
   (`liability_containment` ≥ 5, `ethical_robustness` ≥ 5, per
   `pipeline/README.md`'s scoring) and names a real distribution channel,
   over inventing a 176th niche calculator with no such evidence. A strong,
   non-duplicative idea is never blocked — but "strong" now means
   evidence-backed, because for the first time the fleet has a real
   audience to measure it against instead of a hypothetical one.
5. **Every live product should carry a working, honest donation ask.** See
   the next section — this is the one lever that moves the portfolio's
   revenue off $0 without touching payment rails, and it currently sits
   unrealized behind one owner decision.

## Revenue: donations, and keeping customers happy

The portfolio's revenue model is, and stays, **donations only** — GitHub
Sponsors, nothing else. No payment collection, no payout rails, no merchant
account: that is unchanged and is not up for a rescore by any session (see
"Legal guardrails" below and `PRODUCT_PLAYBOOK.md` §6). What changed on
2026-09-06 is that the reason to bother — a stranger can actually reach the
products now — is real, so the one owner decision that turns this on is
worth naming precisely rather than leaving as a stale queue row:

- **`funding-sponsors-live` (#839 in `portfolio/ledger/decision_queue.py`)**
  is a yes/no on re-landing `.github/FUNDING.yml` (15 lines, `github:
  [Duncan-Haywood]`) pointing at the owner's own GitHub Sponsors profile.
  It was merged once and reverted the same day (#862); the safe state — no
  funding surface — is what's on `main` today. This is an
  account-ownership decision an agent cannot make (it ties a real legal
  person's Sponsors profile to the repo), so it stays owner-only. What an
  agent *can* and should do: make sure nothing about a product's own
  Sponsors line is broken or missing while this is pending, so the day it
  is decided, every product is already carrying its half correctly.
- Every user-facing product still ships the optional Sponsors/donate line
  from `PRODUCT_PLAYBOOK.md` §6 — footer or about section only, never in
  front of a feature, never phrased as payment for using the tool. A
  donation ask that reads like a paywall is a legal-exposure regression,
  not a revenue win; keep it exactly as optional as the free tier it sits
  next to.

**Keeping customers happy is not a separate initiative — it's what makes a
donation ask credible, and it's cheap to check for:**

- **The page has to actually work.** `PLAYWRIGHT=$(npm root -g)/playwright/index.js python3 platform/ci/browser_checks.py`
  and the venture's own tests are what catch a page that renders and
  computes nothing — see `AGENTS.md`. A visitor who hits a broken
  calculator does not come back, let alone donate.
- **Accessible.** `ink.test.mjs` and the WCAG AA link-contrast check exist
  because a tool that fails them is unusable for part of its own audience —
  treat that red the same as any other correctness bug, not as
  optional polish.
- **Honest about what it is and isn't** (the disclaimer in
  `PRODUCT_PLAYBOOK.md` §5b): evidence and drafts, never a determination
  made on the user's behalf, never an uptime promise this portfolio can't
  keep. A customer who was told the truth about a free, best-effort tool is
  a happy one even when something breaks; a customer who was oversold is
  not, however good the tool actually is.
- **Fix reported defects fast, and don't let a defect ship twice.** A bug a
  real visitor hit and a session can reproduce is not "meta-work" or a
  ledger entry to defer — it's the single highest-signal piece of product
  feedback this portfolio currently has, because it's the only kind that
  didn't have to be imagined.

## What a good product looks like here

| Criterion | Why it matters |
|---|---|
| Runs on this VM / GitHub / agents | No new infra spend to try an idea |
| Useful without a human in the loop | Matches how the fleet ships |
| Low variable cost per user | Inference, storage, and egress must not scale linearly with usage at launch |
| Turnkey with API keys | A product blocked only on an owner-supplied key is a win — build it, document the one key, move on |
| Niche + searchable | SEO and AI discovery can carry early growth without ad spend |
| High value per user | Tools that help someone make or save real money beat vanity metrics |

Products that need a marketplace listing, a merchant account, or a paid ad
budget before anyone can use them are **second priority**. Build the thing
people can use from a URL or install command first; unblock distribution when
the owner decides.

## How agents should spend time

**Default job: ship product value.** Features, landing pages, docs, onboarding,
usage tracking, bug fixes, performance, SEO content, integrations behind
env vars. Every session should leave a venture closer to something a stranger
could use and benefit from.

**Rely on the owner as little as possible.** Merge product PRs. Do not
ask whether product code may land. Flag only when the session cannot
finish without a secret, a legal-person account, taking money, publishing
under the public name, or turning on unattended paid spend.

**Not the default job:**

- Re-verifying pull requests another session already verified
- Writing ledger entries that record looking but not building
- Debating whether a prior rule was followed
- Opening analysis documents when code could ship instead
- Expanding the owner decision queue with items that do not block product work
- Asking whether a green product PR may merge — that is yes

Run `python3 portfolio/ledger/session_gate.py` on a generic brief ("continue
work", "improve the process", etc.). If it says **BUILD**, build — and if
anything already on `main` still has no public URL, that deploy is the
build. Do not meta-work. If it says **PROCEED**, keep building what you
were building.

## Development flow

**Speed over review ceremony.** Code that passes the venture's CI and stays
within scope merges without waiting for human review. Iterate in production
(on preview URLs or the VM) rather than in comment threads.

Still required before merge:

- Relevant tests and builds green (read CI; do not hand-rebuild what CI already ran)
- No payment collection, no new legal exposure beyond documented disclaimers
- Usage instrumentation included for new user-facing features

Still **owner-only** (flag on issue #139 / `portfolio/ledger/asks.yaml` only
when product work is actually blocked):

- Taking or moving money (Stripe live keys, payout rails, billing)
- Registering accounts that need a card, ID, domain, or bank account
- **Publishing** under the portfolio's public name (store listing, npm publish,
  production domain cutover) — building privately is always allowed
- Enabling unattended automation that spends paid API budget
- Pasting a secret they hold (Pages enable, deploy tokens, a GitHub PAT)

Internal surfaces and `ventures/*` product code are **agent-decidable**:
verify, merge, ship. Answered 2026-08-25: yes, merge product PRs. Do not
re-ask. `python3 platform/ci/publish_surface.py` still tells you whether a
merge publishes anything live; it does not block the merge.

## Graduating new products

The portfolio may expand beyond its current venture list when a candidate is
genuinely new, addresses a narrow painful problem, and can ship a useful free
slice with the safeguards below. Existing ventures remain the default home for
adjacent features, but historical limits on the number of ventures are not a
reason to defer a strong, non-duplicative product.

1. Pick a niche from `portfolio/pipeline/` or invent one that is **not** in
   `screened-out.md`.
2. Graduate it matching its `graduate_as` field:
   - `graduate_as: venture` — create `ventures/<slug>/` with `VENTURE.yaml`,
     a runnable app, disclaimers, and basic usage tracking.
   - `graduate_as: product-line` — add the slug under `product_lines` in
     its host venture's `VENTURE.yaml` (the host must already be routable).
     Do not open a second venture directory.
3. Ship on GitHub Pages or the Hetzner product box; record usage, not opinions.
4. If the product is already on `main` and still has no public URL, **that
   deploy is the next task** — not a second product in the same niche.
5. Let organic traffic and return usage decide what gets more investment.

Pipeline candidates with a `build-now` verdict are pre-researched starting
points — graduate and build them instead of re-screening.

## Legal guardrails (non-negotiable)

These stay in every product regardless of the speed mandate:

- **No advice-of-record.** Not legal, tax, medical, or filing-on-behalf-of.
  Produce evidence, drafts, and monitoring; the user decides and signs.
- **No "you are compliant" warranties.** Report what was tested and when.
- **No scraping personal data or bought lead lists.**
- **Terms/disclaimers** on user-facing surfaces limiting liability,
  including the no-SLA hosting clause in `PRODUCT_PLAYBOOK.md` §5b.

Payment is deferred, not disclaimers.

## Success signals

Track and prefer work that moves these:

- Weekly active users (or equivalent usage events)
- Return usage within 7 days
- Organic landing traffic (referrer + search)
- Time-to-first-value for a new visitor
- GitHub stars, sponsors, or unsolicited feedback

Deprioritize work that only moves internal metrics (ledger entries, open PR
count, decision-queue rows) unless it directly unblocks a product.

Write the readings down in [`usage/usage.yaml`](usage/usage.yaml) — a number
that only ever existed in a running process is not a signal, and a reading of
zero after a fair run is a result worth recording, not a failure to hide.
[`usage/README.md`](usage/README.md) has the rules: count events, never people;
no PII, no IPs, no content, no analytics vendor; prefer free signals that
already exist (release downloads, package downloads, repo traffic) over
instrumenting anything new.

## What this replaces

The portfolio spent August 2026 on meta-work: re-verification, policy
debates, and decision-queue maintenance while **zero ventures had production
URLs and zero revenue was recorded**. That ends here. The router, ledger, and
pipeline remain as **tools** — not as the work itself.
