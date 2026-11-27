---
kind: note
subjects: [security, residential-takeoff, wall-framing-takeoff]
---
# Residential Takeoff (bet #6) moved into this repository (part 1 of `move-wall-framing-takeoff-public`)

Step 4 of task `products-to-public-repo` for bet #6 (`portfolio/monetization/bets.md`), the last
construction bet still only in `private-monorepo`. The paid edition of Wall Framing Takeoff now lives in
[`ventures/residential-takeoff/apps/wall-framing-takeoff`](../../ventures/residential-takeoff/README.md)
under the all-rights-reserved notice. Why: the owner chose to move the private apps here (2026-11-27,
`portfolio/work/tasks.yaml`, `products-to-public-repo`), `private-monorepo`'s Actions start no jobs,
and a scheduled run can always clone this repository. Bets #1 to #5 moved the same day.

## What was copied

`git archive` of `private-monorepo` commit `71e2b6c` (2026-11-27, "roof outline from a DXF roof
layer", private PR 488), `apps/wall-framing-takeoff` only: 330 tracked files, one binary
(`ifc-engine.wasm`, built from the committed Rust source in `ifc-engine/`, which has no crate
dependencies). The app is static ES modules with no `package.json` and imports no `packages/*`, so
no workspace files came with it. Layout: `ventures/residential-takeoff/apps/wall-framing-takeoff`,
the `ventures/<venture>/apps/<app>` shape the other bets use, so `roadmap_claim.py wall-framing-takeoff`
now claims here (its `ventures/*/apps/<app>` lookup wins over the private clone).

Why a new venture directory and not `ventures/wall-framing-takeoff`: that is the **free edition**,
MIT, live at `/wall-framing-takeoff/`, frozen on 2026-11-24 for lead-magnet upkeep. The paid edition
started as a copy of it (`PROVENANCE.md`, commit `c0b3321c4`) and has added the supplier material
list, outline and hip roofs, roof DXF, roof plans, outline sheathing and the dark paid path (33 files
only in the paid copy, 118 changed). The two must not share a directory or a licence.

## Changes made in the copy

- **LICENSE** replaced with `portfolio/monetization/licences/ALL-RIGHTS-RESERVED`, in the app and at the
  venture root. The private LICENSE said "see the repository's root LICENSE", which here is FSL-1.1-MIT,
  the wrong licence for a paid product. The template's "Earlier versions" paragraph keeps the MIT
  baseline MIT, and `PROVENANCE.md` still names the baseline commit.
- **`VENTURE.yaml`** in the app removed: it was the free edition's (name `wall-framing-takeoff`,
  production URL `/wall-framing-takeoff/`), so a second registry entry under the same name. The venture
  root has its own (`residential-takeoff`, production `null`).
- **Sixteen object-map lookups** given an own-key check (`Object.hasOwn(MAP, key) ? MAP[key] : ...`) in
  `deck.mjs`, `drawings.mjs`, `dxf.mjs`, `engine.mjs`, `foundation.mjs`, `pdf.mjs` and `roofdxf.mjs`.
  `platform/ci/inherited_keys.py` fails CI on a new unguarded lookup. These are in its baseline under the
  free edition's path, so in the copy they were "new". A header, lumber size, bar size or unit named
  `constructor` or `toString` used to find `Object.prototype` instead of the fallback. Now it takes the
  same fallback as any unknown name. Fixed rather than baselined, since the ratchet only shrinks.
- **Spreadsheet formula-injection guard** (CWE-1236) ported into the CSV exporters of `engine.mjs`,
  `budget.mjs` and `schedule.mjs`, the same one-line `q` the free edition carries. The free edition
  got it after the 2026-11-24 fork, so the paid copy was exporting a wall or line name starting with
  `=`, `+`, `-` or `@` as a live formula. `check_csv_formula_guard.py` caught it in CI.
  (`materiallist.mjs`'s `csvCell` already had the guard.)
- Four Markdown links in the app's README and ROADMAP were rewritten for the two extra directory
  levels. The buildingSMART fixtures got their own `platform/ci/third_party.json` entry.
  `portfolio/monetization/verticals.json` was regenerated (`verticals.py --write`) and the venture
  count in `PRODUCT_PLAYBOOK.md` refreshed (`check_doc_counts.py --fix`).
- **Four `// @ts-check` diagnostics** fixed (`platform/pages/typecheck.mjs`, which `ventures-tests.yml`
  runs on touched ventures and private CI never ran). The fixes are types only: `dxf.mjs`'s return type
  now names `outline` and `wallThickness`, and three failure-branch reads in `roofoutline.mjs` and
  `siding.mjs` are cast where the union does not narrow on `ok`.
- `portfolio/monetization/transition.json` regenerated (`transition.py --write`). Its heuristic files the
  venture as "subscription" because it sees a script (`sync-from-private.sh`), but the product is a
  $29 one-off per house (`docs/PRICING.md`). The generated row is left as the rule writes it.
- No fixture emails, hostnames or `private-monorepo` paths needed rewriting (the audit found none).

## Verification (this session)

| check | result |
| --- | --- |
| `python3 platform/ci/run_venture_tests.py residential-takeoff` (the `ventures-tests.yml` step) | 1,329 tests, 1,327 pass, 2 skipped, 0 fail; site page checks ok |
| `python3 platform/ci/inherited_keys.py residential-takeoff` | 0 new (was 16 before the fixes) |
| `node --test '*.test.mjs'` in the app before the fixes | 1,327 pass, 2 skipped |

The skips are the same as in the private repository: `page.test.mjs` checks the free cut-list
optimizer links back to `../cut-list-optimizer/`, a sibling that exists only when the page is served
beside the catalogue's ventures. The page's `../<tool>/` links have the same assumption. They are
right for the free edition and must be rewritten for wherever the paid page is served.

Not run: the Rust tests in `ifc-engine/` (no toolchain in the session; the committed `.wasm` is what
the page and `ifc.test.mjs` use, and those pass).

## Pre-publication audit

On the source, `prepub_audit.py /home/user/private-monorepo apps/wall-framing-takeoff`:
**block 0, review 3**. On `ventures/residential-takeoff` as committed: **block 0, review 9**.

| level | rule | where | read |
|---|---|---|---|
| review | confidentiality marker | `apps/wall-framing-takeoff/siding.test.mjs:139, 147` | "do not share" in a comment about two boards not sharing one piece of stock: keep |
| review | public IPv4 address | `apps/wall-framing-takeoff/ifc-engine/scripts/fetch-models.sh:10` | `2.3.0.1` in buildingSMART's public folder name `IFC%202.3.0.1`: not an address, keep |
| review | names private-monorepo | `README.md:62, 66`, `VENTURE.yaml:11`, `sync-from-private.sh:2, 5, 17` | this move's own notes and the sync script: keep until the private copy is removed |

Third-party files: `fixtures/` holds the buildingSMART IFC samples (CC BY 4.0, notice in
`fixtures/BSI-LICENSE.md`) and CC0 plans. They are byte-identical to the free edition's `fixtures/`,
which has been public since before the import. Not checked: the private history's co-authors
(`docs/STEP4_NOTES.md`). The clone is shallow, and the gate is for the first sale, not the move.

## Next

1. **Hosting for the paid page.** It is not served, and the catalogue build serves only a venture's
   root `index.html`. Hosted SaaS is the default (`prompts/goals.md`, the 2026-11-24 pivot), so the likely
   route is the estimating module inside PayApps (bet #1) that `ROADMAP.md` ("Joining the contractor
   suite") already plans, with a standalone page for the $29 Job report.
2. **Checkout on Paddle.** `checkout.mjs` and `billing.mjs` were written against Lemon Squeezy's public
   licence-validate call, from memory and never run, for a static page with no server. The owner's
   merchant of record is Paddle (`prompts/goals.md`, "Payments"). Moving to Paddle needs a server for the
   webhook, which is another reason for (1).
3. Repoint `bets.md` (done in this PR) and `portfolio/monetization/models.yaml`, then remove the private
   copy in a `private-monorepo` PR. Until then, refresh with `ventures/residential-takeoff/sync-from-private.sh`.
