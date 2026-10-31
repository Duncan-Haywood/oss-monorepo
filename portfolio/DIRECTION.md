# Company direction

The portfolio's operating strategy, cut on 2026-10-21 from 875 lines to what
is true now. The full earlier text (dated corrections, incident stories,
per-session numbers) is in
[`docs/history/direction-full-text-2026-10-21.md`](../docs/history/direction-full-text-2026-10-21.md).

Where this file disagrees with [`prompts/goals.md`](../prompts/goals.md) or
the ventures sub-prompt, those win. Sections that say "the owner's framing"
are an agent's reading, not a quotation (`goals.md`, "Judgment over rules").

Companions that carry the detail:

- [`PRODUCT_PLAYBOOK.md`](../PRODUCT_PLAYBOOK.md): niche choice, product
  shapes at $0 per user to us, the API-key switch, disclaimer text, SEO checklist, definition of done.
- [`portfolio/hosting/`](hosting/README.md): GitHub Pages hosts our web
  surfaces (the Hetzner/k3s route was deleted 2026-10-01). Products are not
  limited to static pages or the browser (owner, 2026-10-21 and 2026-10-30): apps, CLIs, packages and
  services for others to run ship through their own channels
  ([`portfolio/distribution/`](distribution/README.md)).
- [`portfolio/usage/`](usage/README.md): what may be counted (events, never
  people), free signals, and where readings land (`usage/usage.yaml`).

## North star

Find *viable software businesses*: products that reach real users, earn
optional donation revenue, keep those users happy, and create no legal
exposure the owner must clean up personally.

1. **Ship and deploy, not just build.** An `index.html` on `main` with no public
   URL is not a product yet. `python3 platform/ci/pages_state.py` says whether
   the live snapshot matches `main`; if it is stale, refreshing it outranks new work.
2. **Raise the bar, not the count.** There are 190+ ventures and no nonzero
   usage reading yet (`usage/usage.yaml`; unmeasured, not zero). A new venture
   is welcome when it is a genuinely different product rather than a newly started calculator
   (owner, 2026-10-21: depth over calculators; already-built ones can still merge) and not another copy of a template family (121 near-identical `*-bid-calculator` ventures were built
   while none was measured: `docs/reports/2026-10-16-calculator-glut.md`).
   Name where the first real visitor would come from (a subreddit, a search
   phrase with volume, a competitor's comparison traffic) before graduating
   one, and run `python3 portfolio/pipeline/duplicate_check.py "<niche>"` first.
   Distribution, measurement and the flagships rank ahead.
3. **Measure.** Usage is the only honest signal. Any product with a nonzero
   reading ranks by it (`platform/ci/usage_state.py`). A reading of zero after
   a fair run is a result worth recording.
4. **Legal exposure is the one hard stop** (see "Legal guardrails").
5. **Restating this brief rarely helps.** A session told to "set direction" should check
   `git log -5 -- portfolio/DIRECTION.md AGENTS.md` first; rewording a correct
   brief is not progress. `python3 portfolio/ledger/check_direction_only.py`
   exits 1 when a branch changes only these two files.

## What we are doing

Build traditional software that creates a lot of value for real users in
super-niche markets where people have money and a concrete problem, especially
problems that help them earn more. Add AI only where it clearly improves the
product. Start from abundant free value, measure what people come back to
without paid acquisition, and double down on that. No effort on
calculators beyond fixes; already-built ones can still merge (owner, 2026-10-21; `goals.md`,
"Direction: depth over calculators").

- Do not collect payment on, or wire payout rails to, the owner's accounts.
- Keep liability-limiting disclaimers in every user-facing product.
- Add a GitHub Sponsors or donation link where it fits (optional, never a paywall).

## Current priority

1. If `pages_state.py` says the snapshot is stale, refresh it.
2. Get a first usage reading for a product, or act on one that exists.
3. Deepen the top flagship in [`portfolio/flagships.yaml`](flagships.yaml).
   Since 2026-10-31 the overarching directions are deep tech industrial,
   energy, real estate development and construction, and a construction data
   warehouse, with robotics, site imaging and sensing, and autonomy inside
   them (`prompts/goals.md`, "Direction: industrial, energy and
   construction"): the construction flagship ranks first, and a new venture
   in these areas is the first kind to look for.
4. A genuinely new, different venture, when one clears the gates.

The catalogue is live at `https://duncan-haywood.github.io/monorepo-projects/`;
merging publishes it. `python3 platform/ci/publish_surface.py` says whether a
merge publishes anything. `python3 portfolio/router/allocate.py` names the
highest-merit dispatchable venture.

## Revenue

The owner's own instances take donations only (GitHub Sponsors). A product may
ship payment code that is off by default and runs on the deployer's own keys,
never the owner's (`PRODUCT_PLAYBOOK.md` §6). A per-product `github.com/sponsors`
link is agent-decidable. The repo-level GitHub "Sponsor" button
(`.github/FUNDING.yml`, decision `funding-sponsors-live` in
`portfolio/ledger/decision_queue.py`) ties a real person's Sponsors profile to
the repo and stays owner-only. Keeping customers happy means working, honest
products: no fake claims, working links, answers to feedback.

## Owner direction: new ventures get first call, legal exposure is the one hard stop

New ventures rank ahead of a parity feature on a product nobody has visited,
when a genuine one clears the gates and (per North star 2) is not a copy. The
`build-now` queue in `portfolio/pipeline/candidates.yaml` is empty because
everything scored and ready was built; pipeline candidates with a `probe`
verdict that already have a directory wait on an owner-gated buyer test, so
leave their verdicts. `session_gate.py` reads these fields to name the next candidate.

## What a good product looks like here

| Criterion | Why it matters |
|---|---|
| Runs on GitHub and agents | No new infra spend to try an idea |
| Useful without a human in the loop | Matches how the fleet ships |
| Low variable cost per user | Inference, storage and egress should not scale with usage |
| Turnkey with API keys | A product blocked only on an owner key is a win: document the one key and move on |
| Niche and searchable | SEO and AI discovery can carry early growth without ad spend |
| High value per user | Tools that help someone make or save real money beat vanity metrics |

Products that need a marketplace listing, a merchant account or a paid ad
budget before anyone can use them are second priority.

## How agents should spend time

**Default job: ship product value.** Features, landing pages, docs, usage
tracking, bug fixes, SEO content, integrations behind env vars.

Not the default job: re-verifying PRs another session verified; ledger entries
that record looking but not building; debating whether a prior rule was
followed; analysis documents when code could ship; adding owner-queue rows that
do not block product work; asking whether a green product PR may merge (yes).

Run `python3 portfolio/ledger/session_gate.py` on a generic brief. **BUILD**
means build (an undeployed product's deploy is the build); **PROCEED** means
keep building what you were.

## Development flow

Code that passes the venture's CI and stays in scope merges without human
review. Before merge, expect relevant tests and builds green (a red `main`
costs every later run) and usage instrumentation on new user-facing features;
never payment on the owner's accounts or legal exposure beyond documented
disclaimers.

Owner-only (flag in `portfolio/ledger/asks.yaml` only when product work is
blocked): moving money; accounts that need a card, ID, domain or bank;
publishing under the portfolio's public name; unattended automation that
spends paid budget; a secret only they hold. `ventures/*` product code is
agent-decidable: verify, merge, ship.

## Graduating new products

A candidate qualifies when it is genuinely new, addresses a narrow painful
problem, and can ship a useful free slice with the safeguards below.

1. Pick a niche from `portfolio/pipeline/` or invent one not in `screened-out.md`.
2. Graduate by its `graduate_as` field: `venture` creates `ventures/<slug>/`
   with `VENTURE.yaml`, a runnable app, disclaimers and usage tracking;
   `product-line` adds the slug under `product_lines` in its host venture.
3. Ship it where its users are (a Pages page, a package, a release, an app
   build); record usage, not opinions.
4. If a product on `main` has no public URL, that deploy is the next task.
5. Let organic traffic and return usage decide further investment.

## Legal guardrails (non-negotiable)

- **No advice-of-record.** Not legal, tax, medical or filing-on-behalf-of;
  produce evidence, drafts and monitoring, and the user decides and signs.
- **No "you are compliant" warranties.** Report what was tested and when.
- **No scraping personal data or bought lead lists.**
- **Terms and disclaimers** on user-facing surfaces, including the no-SLA
  hosting clause (`PRODUCT_PLAYBOOK.md` §5b).
- **Comparison pages that name a competitor** carry a nominative-fair-use
  disclaimer and stick to sourced facts (`PRODUCT_PLAYBOOK.md` §5f, enforced by
  `node platform/pages/clauses.mjs <slug>`).

## Success signals

Prefer work that moves weekly active use, return use within 7 days, organic
landing traffic, time to first value, and stars, sponsors or unsolicited
feedback. Deprioritize work that only moves internal counts (ledger entries,
open PRs, queue rows). Write readings in [`usage/usage.yaml`](usage/usage.yaml);
rules for what may be counted are in [`usage/README.md`](usage/README.md)
(follow the law and go no stricter).
