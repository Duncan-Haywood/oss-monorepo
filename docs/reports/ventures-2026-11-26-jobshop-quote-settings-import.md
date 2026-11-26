---
kind: milestone
date: 2026-11-26
---
# Job Shop Quote: shop settings from the rate-card sheet (2026-11-26)

This is bet #2 (`portfolio/monetization/bets.md`). The work is private-monorepo PR #223 (branch
`jobshop-quote/rate-card-import-part-3-settings`, claim
`claim/jobshop-quote/rate-card-import-part-3-settings`). It covers part of ROADMAP item 11:
"settings (markups, minimums) from the same sheet".

## Why this item
The private clone worked on the first try (add_repo with push access, then one shallow clone). On
bet #1 (payapps), the free Next items either need a new dependency (in-browser OCR for scans
without a text layer, a HEIC decoder for Chrome and Firefox), are waiting on "once a customer
asks", or were claimed minutes earlier. On jobshop-quote, the item-10 page dates were claimed by
another run one minute before mine (`page-dates-shop-time-zone`), so I released my claim. Item 11's
settings part had no claim, and the only other claim on item 11 (`clear-cells`) covers a different
part. The settings part also finishes onboarding: a shop that already keeps a price list in Excel
can now set its markups and line minimum from that file, as well as its machines.

## What landed
- `src/shared/settings-import.ts` reads label/value rows anywhere on a worksheet. Only a row's
  first non-empty cell can be a label, and its next non-empty cell is the value, so the rate
  table's own header and rows are never read as settings. That makes a markup block above the
  machine table import in one paste, and the machine import on the same grid still finds its
  header below the block (a test covers this).
- Six settings: labor, material and outside-service markup; minimum line charge; quote valid
  (days, or weeks from the label or the cell; months are refused); default quantity breaks.
- Ambiguous labels are left out, and the preview gives the reason: "Markup" on its own, "Margin"
  (a margin is not a markup), "Minimum order" and "Minimum charge" (quotes apply their minimum
  per line).
- A quantity cell of "5,100" is refused, because it could be 5100 or 5 and 100. "1,000" is read
  as 1000, because 000 is not a quantity.
- `planSettingsImport` checks each value with the settings editor's own zod schema and sends only
  the changed settings through the existing `PATCH /settings`. No new route was added.
- The settings form now reloads whenever the saved settings change. Without that, the form kept
  the values it opened with, and pressing Save on it after an import would have written them back
  over the imported ones.
- The export ("Setting,Value", UTF-8 with a BOM) and the blank template both read back unchanged.

## Still open on item 11
- Clearing a value from the sheet (claimed separately as `clear-cells`).
- An .xlsx export.
- The text settings (lead time, terms), if shops keep them in the sheet.
- Multiple currencies.

## Verification
- `pnpm typecheck` and biome: clean.
- `settings-import.test.ts`: 26 unit tests pass.
- `test/worker/settings-import.test.ts` passes. It checks that the planned patch is accepted and
  saved for this shop only, that an estimator gets 403, and that re-importing the same sheet
  changes nothing.
- Playwright: the new `06-settings-import.spec.ts` and the existing `05-team-and-import.spec.ts`
  both pass.
- The private repo's CI has no runner, so `run_workflow_locally.py jobshop-quote-ci` ran from the
  clone: 11/11 run steps passed, including Playwright e2e (8 `uses:` steps not run). PR 223 merged.
