# Working in this repo

**Read [`portfolio/DIRECTION.md`](portfolio/DIRECTION.md) and [`AGENTS.md`](AGENTS.md)
first.** The portfolio's job is to ship products people use — not to debate
policy, re-verify old PRs, or maintain admin queues.

`README.md` covers repo layout.

## Product-first default

Every session should move a venture closer to something strangers can use for
free, with usage tracked and disclaimers in place. Features, fixes, landing
pages, SEO, integrations (behind env vars), and VM-runnable apps beat ledger
entries and analysis documents.

Target super-niches where users have money and a real problem — especially
tools that help them earn more. Low variable cost, traditional software, AI
only where it clearly helps. Payment and payout rails stay off; GitHub
Sponsors/donations are fine.

## Session gate (generic briefs only)

```
python3 portfolio/ledger/session_gate.py
```

Run this when the brief is vague ("continue work", "improve the process",
"research new projects"). **BUILD** → ship product value (gate names a
`build-now` candidate if one exists). **PROCEED** → keep building. The gate
never means stop.

Named tasks, venture work, red CI, and PRs you are driving skip the gate.

## Ship without review ceremony

**Merge when CI is green.** No human code review. Fix forward.

Before merge: run or read CI; scope stays in-bounds; new user-facing surfaces
have disclaimers and usage tracking.

**Agent-decidable — verify and merge yourself:**

- `platform/`, `portfolio/`, docs, tests, CI — internal surfaces
- Free full-feature products, usage instrumentation, sponsor links
  (building privately; merging `ventures/*` is a separate gate)

`python3 platform/ci/publish_surface.py` currently shows nothing live on
push to `main`. That does not make venture app code agent-decidable on
its own — the owner-only list below still covers breaking changes to it,
and Ask 9 (`venture-gate-premise`) is still open.

**Owner-only — flag only when it blocks product work you cannot finish:**

- Taking or moving money (billing, payout rails, live Stripe)
- Registering accounts needing card, government ID, domain, or bank
- Publishing under the portfolio's public name (store listing, npm publish,
  production domain) — building the artifact privately is always allowed
- Enabling unattended automation that spends paid API budget
- Breaking changes to deployable `ventures/*` code

`python3 portfolio/ledger/decision_queue.py` lists owner decisions already
queued. Do not add duplicate asks. Do not expand the queue with items that
do not block shipping.

If a prior verification exists, run
`python3 portfolio/ledger/verification_status.py` before re-running tests —
do not re-verify unchanged PRs.

## Pipeline and new ventures

Screening is done — see `portfolio/pipeline/`. Do not produce another
candidate list. Either:

1. Build a `build-now` candidate (`session_gate.py` names the top one), or
2. Graduate and build a new niche not in `screened-out.md`.

A candidate becomes routable when it has `ventures/<slug>/VENTURE.yaml` or a
`product_lines` entry on its host venture.

## Duplicate PRs

Scheduled sessions often overlap. Before opening a PR, check open PRs and
recent commits. Extend or consolidate instead of duplicating. If the backlog
is large, merge the strongest and close the rest with a pointer.

## Ledger (minimal)

Record outcomes in the monthly ledger when you **shipped or learned something
new** — not when you looked and confirmed the same blockers. Never bundle a
ledger entry into a PR waiting on the owner.

`git fetch origin main` before appending; skip if the latest entry already
covers your finding.

## Automation

Do not add or re-enable unattended workflows that push commits or call paid
APIs without owner approval.

## Never write `fixes #N` / `closes #N` about someone else's PR

GitHub closes the referenced PR **unmerged** when that commit hits `main`.
Refer as "#109" or "PR #109". Rephrase "fixed #109's conflict" → "resolved
the merge conflict on #109".

When intentionally closing a PR, comment why and point to what supersedes it.
