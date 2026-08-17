# Integration report, 2026-08-17 — `agent/cap-enrollment-ts`

`scripts/ci/integration_debt.py` reports two independent tips ahead of
`origin/main`: `main`, and `agent/cap-enrollment-ts`. This file records what the
second one is, so the analysis is not re-derived a fourth time. It has been done
at least three times already, and twice the conclusion was reached and lost.

**Conclusion: do not merge this branch. Its finding was already harvested into
`main`; its remedy is incompatible with the mechanism `main` settled on. Twenty
of its register entries are worth taking, and are itemised below.**

## What it is

Merge-base `fd84e089` (2026-08-06). `main` is +156 commits from there; the
branch is +7. Both sides independently grew `scripts/ci/cap_ratchet.py` from
1109 lines to roughly 2450. This is the built-twice case in full, and the two
halves are not extensions of one another:

| | `main` | `agent/cap-enrollment-ts` |
|---|---|---|
| mechanism | `class Pin` / `PINS` (77 entries) / `evaluate_pins()` | `WATCHES` extended 49 → 126, all directional |
| TS reader | `TS_CONST_DECL`, `fold_ts_number`, `ts_module_constants → DeclaredConstant` | `_TS_CONST_DECL`, `_ts_number`, `ts_module_constants → TsConstant` |
| enrollment | `money_named_venture_constants()`, `source_literal_pins_declaration()` | `TsConstant.is_load_bearing`, `ts_bare_load_bearing_numbers()` |
| exemptions | `VentureExemption` + re-run `VENTURE_PREDICATES` | `TsExemption` + `UNWATCHED_TS_NUMBERS` (owner + expiry) |

Note the near-collisions. `ts_module_constants` and `extract_ts_constant` exist
on **both** sides with the same names and different return types, and
`declared_ts_bound_constants` / `declared_bound_ts_constants` are word-transposed
twins. A conflict resolved by keeping both blocks yields a file that imports
cleanly and silently uses whichever definition comes last. `extract()` is
byte-identical on both sides, which is exactly why *entries* are portable
between them and *engines* are not.

## `main` already rejected it, by name

`main:scripts/ci/cap_ratchet.py:1015-1019` says so in the source:

> found by running the bare-literal detector from the abandoned
> `agent/cap-enrollment-ts` branch over the current sources — that branch's
> remedy (hoist every literal into a shared module) is incompatible with the
> anchored-pin approach this file settled on, but its *finding* here was real
> and is held below by this file's own mechanism instead.

The framing-royalty pins at L1027 and L1038 (`0.15`, `0.55`) are that harvest.

## Why taking the TypeScript half would break the pins

The branch's print-atelier commits hoist money literals into a new shared module,
`ventures/print-atelier/src/lib/artist-split.ts` (`ARTIST_NET_PROFIT_SHARE = 0.3`
and siblings). That module is genuinely new — `main` has no equivalent and no
such constant name anywhere — so there is no duplicate-definition hazard in the
TypeScript itself.

The damage is one level up. Running `main`'s own `PINS`, `fold_ts_number` and
`strip_ts_comments` against the branch's file contents: **54 of 77 pins survive,
23 break**, every break a zero-match because `([0-9.]+)` cannot match an
identifier. Thirteen are `source-literal` pins (both `stripe-connect.ts` transfer
pins, `artist-terms.ts`, `global-pricing.ts`, both `FinancialProjections.tsx`
pins, the `framing-dynamic-pricing.ts` royalty pin, and more); the other ten are
**every** `literal-census` pin, since the branch is precisely a campaign to
delete the literals being counted. The reverse also fails: `main`'s
`money_named_venture_constants()` enumerates from `git ls-files`, so the branch's
new constants enroll themselves and find no holder — 8 unheld money constants.

## What to take: 20 register entries

Add these to `main`'s existing `WATCHES` tuple. Each was verified to resolve
against `main`'s tree today using `main`'s own `holders_of()` and
`extract_ts_constant()`:

- `ai-first-markets/src/lib/auth.ts::AUTH_COOKIE_MAX_AGE` (down, 604800)
- 13 × `local-site-studio/src/lib/digest/daily-digest.ts` `*_LIMIT` (down, 5)
- `photo-editing/docs-site/src/lib/auth.ts::PASSWORD_SESSION_MAX_AGE_SEC` (down, 43200)
- `photo-editing/docs-site/src/lib/auth.ts::TOKEN_SESSION_MAX_AGE_SEC` (down, 604800)
- `print-atelier/src/lib/investor.ts::defaultWeeklyBudget` (down, 6800)
- `print-atelier/src/components/InvestorDashboard.tsx::defaultWeeklyBudget` (down, 6800)
- `print-atelier/src/lib/ad-catalog.ts::DEFAULT_MIN_CREATIVE_SCORE` (up, 60)
- `print-atelier/src/lib/print-damage-claims.ts::MINIMUM_EVIDENCE_PHOTOS` (up, 2)

Drop the other 57: 49 are already held by `main`'s pins or watches, 2 point at
`artist-split.ts` (absent from `main`), 6 name constants the branch's own
TypeScript edits introduce. Two more — `b2b-trade.ts::MIN_PLATFORM_NET_MARGIN_PCT`
and `retentionWindow.ts::MIN_RETENTION_FACTOR`, both `up` — were added
identically on both sides; dedupe, do not stack.

Do **not** take: `TsConstant`, `ts_bare_load_bearing_numbers`, `BareNumber`,
`_TS_PARAM_DEFAULT`, `_TS_FRACTION_MULTIPLY`, `ts_name_words`,
`declared_bound_ts_constants`, `TsExemption`/`UNWATCHED_TS_NUMBERS`, or the
branch's `ts_module_constants`/`extract_ts_constant`. Those are the second
engine, and the name collisions make a "keep both" resolution look clean and
behave wrong.

`blobs_at()` (branch L2134) is a batch blob reader `main` lacks — pure
performance, no correctness content. Its only caller is the branch's `measure()`,
so taking it means rewiring `main`'s. Not worth coupling to this.

## Merge mechanics, if the entries are taken

`git merge-tree` yields exactly three conflicts:

1. `ventures/print-atelier/src/lib/stripe-webhook-server.ts` — **take `main`**.
   Docblock only; the code line is identical on both sides.
2. `scripts/ci/cap_ratchet.py` — **resolve `--ours`**, then hand-add the 20
   entries above.
3. `tests/test_cap_ratchet.py` — **take `main`**. The branch's
   `TypeScriptBareNumberTests`, `BatchBlobReaderTests` and
   `VentureTypeScriptEnrollmentTests` exercise machinery that does not exist
   under `main`'s engine and will not import.

Then `git checkout --ours` all 12 print-atelier files, `artist-split.ts`
included. Taking them turns 23 pins red on a branch whose whole purpose is that
those pins are green.

If the branch is closed rather than merged, `artist-split.ts` must be registered
in this file's `dropped_artifacts` register in
`platform/integration-debt-budget.yaml` with that reason — convergence reached by
discarding a file is what that register exists to make visible.

## Not a collision

`branch_collisions.py` reports `platform/ci/test/promotion-revision-provenance.test.mjs`
as having two competing versions (`43aa176e`, `9367cc1b`). Both are already
ancestors of `main`, reconciled at merge `e55c5e8d` into a true superset — ten
tests, carrying the digest-provenance axis from `43aa176e` *plus* the
source-contract test that `43aa176e` had dropped. `cap-enrollment-ts` carries the
pre-merge snapshot only because it forked minutes before that merge; it never
touched the file, and it does not appear in the merge-tree conflict list. No
action.

## Carried forward: a defect neither engine holds

`artist-split.ts` records, and `main`'s `cap_ratchet.py` header records
independently, that the twelve sites computing the artist's 30% disagree on what
it is 30% *of*. Confirmed at this HEAD:

    fulfillment-cost-router.ts:172   retailPriceUsd * 0.3     <-- retail price
    artist-terms.ts:174              netProfit * 0.3
    marketplace.ts:386               netProfit * 0.3
    global-pricing.ts:276            grossProfitLocal * 0.3
    b2b-trade-calculator.ts:108      grossMargin * 0.3
    pod-routing-optimizer.ts:143     grossProfitUsd * 0.3

`fulfillment-cost-router.ts:172` is the outlier, and its own comment on the line
above contradicts it: `// 30% net profit split promise to artist (30% of retail
price)`. It is reachable from `src/app/api/fulfillment/cost-router/route.ts`, and
`pod-routing-optimizer.ts` computes the same quantity the other way — so the two
routing modules disagree about what an artist is owed. On a $120 print with $45
net profit the two bases give $36 and $13.50.

Naming the rate, which is all either engine does, does not reconcile denominators.
**This is a commercial term, not a code cleanup**: which basis is correct depends
on what the artist agreement actually promises, and `docs/ENGINEERING-ROADMAP.md`
reserves pricing and payout decisions to the portfolio owner. Recorded here
rather than fixed. Nothing pays out today — the storefront takes no money — so
this is not live, but it must be settled before the first payout runs.
