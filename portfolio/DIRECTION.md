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

A product that only exists as `index.html` in this repo is not yet a product
people use. As of 2026-08-25 a cluster of calculators and CLIs is on `main`
(seller-fee tools, trade bids, quote-margin, retainage, e-invoice preflight,
and others) and **none of them have a public URL**. Every usage reading is
still a zero baseline. `python3 platform/ci/publish_surface.py` still
reports nothing live on a push to `main`.

That tool reads `gitops/` as well as the workflows since 2026-08-31, so
"nothing live" is now a statement about both delivery paths rather than
only the one this paragraph was written about. On the Hetzner path it
reports, per hostname: `marisstella.dev` and `www.marisstella.dev` answer
on merge already (annotation-only 301s, no workload, no Secret), and
`tools.marisstella.dev` — the one that serves the 169 tools — fails closed
on the unsealed Secret `portfolio-site-repo`. Since both redirects point
at that host, no stranger reaches content, and the tool says so rather
than letting "two hosts live" stand.

One seal, not one build, is what stands between this paragraph and being
obsolete: `./bootstrap/scripts/seal-owner-secrets.sh site`.

Until at least one already-built user-facing surface is reachable by a
stranger, **deploy beats another build**:

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
