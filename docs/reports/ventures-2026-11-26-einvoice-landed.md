---
kind: milestone
date: 2026-11-26
---
# E-invoice fix-and-explain (bet #3) is on private main (2026-11-26)

Bet #3 in `portfolio/monetization/bets.md`. Its two private-monorepo PRs had been open
and stranded since 2026-11-24: #26 (`apps/einvoice-preflight`, the import plus the paid
layer `pro/`) and #20 (`apps/einvoice-site`, the DE/FR/EN marketing site). This run merged
`main` into both, checked them and merged them. Then it added PR #212: `ROADMAP.md`,
so `platform/ci/roadmap_claim.py einvoice-preflight` lists claimable Next items, plus the
app's row in the README. Bet #3 had no app on main before today.

## Why this, not bets #1 and #2
Every free payapps (bet #1) ROADMAP item was blocked from this session or waits on a
customer:
- **Statute sites:** flsenate, azleg, capitol.texas, leg.state.nv and the others answered
  `CONNECT 403` through the proxy, and WebFetch got DNS failures, so no new statutory form
  could be read.
- **Portal formats:** docs.oracle.com (Textura) did not resolve.
- **OCR and HEIC:** both need a decoder dependency, which the repo's CLAUDE.md does not
  allow without the owner asking.

Jobshop-quote's (bet #2) Next items are all "if shops ask". Earlier runs in the same
session window could reach some of those statute hosts, so probe again before ruling them
out.

## Changes made while landing
- `pro/llm.mjs` defaulted to `claude-opus-5-5`, against the private CLAUDE.md
  cheapest-model rule. It now defaults to `claude-haiku-5-5`.
  - Haiku 5.5 has **no server-side refusal fallback**, so `betas`/`fallbacks` are sent only
    when `supportsServerFallback(model)` is true. That covers anything not named
    `claude-haiku*`.
  - New `pro/llm.test.mjs` checks the request shape against a recording client.
- Conflicts were only the root README table (#20) and `CLAUDE.md` (#26). Both sides were
  kept in each.

## Verification (CI starved: every job ended red in 2-3 s, and `ci_starvation.py` said no runner was assigned)
- `apps/einvoice-site`: `node build.mjs` built 36 pages; `node --test test/*.test.mjs`
  passed 30/30; `biome ci` is clean.
- `apps/einvoice-preflight`: `node --test pro/*.test.mjs` passed 47/47.
  `node --test *.test.mjs` gave 2179 pass, 142 skipped and 1 fail. The failure is
  `pdfdetach` in the poppler test, which this container blocks; PR #26's author saw the
  same.

## Traps for the next run
- `platform/security/risk_review.py` crashes with a `UnicodeDecodeError` on a diff that
  contains non-UTF-8 bytes (the imported binary fixtures). `git()` uses `text=True`
  without `errors=`. To get a result I ran a scratch copy with `errors="replace"`. The copy
  needs `platform/ci/`, `.github/CODEOWNERS` and `prompts/goals.md` beside it, because the
  script resolves them from its own root. Backlog P089.
- Root `biome.json` in private-monorepo skips `apps/einvoice-preflight`, so `biome ci` on
  it reports "no files processed". That is expected, not a failure.
- The site's PR #20 was a **draft**. `merge_pull_request` returns 405 until
  `update_pull_request draft:false`.

## Next for the bet
The app's `ROADMAP.md`, Next 1-6: hosting choice (Worker port vs Node), D1/SQLite store
adapter, billing via `packages/billing` (dark), workspace web UI, align the site's
checked/not-checked lists. Owner-only:
- the licence decision on `plain/` rule sets (EUPL/MPL/Apache/LGPL, plus Croatian with
  no stated licence)
- Paddle links and a domain
- native DE/FR review of the copy
