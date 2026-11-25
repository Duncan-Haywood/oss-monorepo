---
kind: milestone
date: 2026-11-25
---
# PayApps (bet #1): unmatched continuation-sheet rows placed on a line

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#118 (merged).

**What landed.** This is "Mid-job start, part 3" from the payapps ROADMAP, the piece that lets the
contractor place an unmatched row. The opening-balance fill reads the last continuation sheet a
contractor sent from elsewhere. It already listed rows it could not place (no line matched, or
more than one did), and the contractor then had to retype that work by hand. Each such row now has
a line picker in the fill report. The row's work is added to the chosen line. Moving it, or picking
"Not on a line", takes the same amount back off, never below $0.00. Any line pushed over its
scheduled value is named under the pickers.

**Why a buyer cares.** The rows that most often fail to match are change-order rows that added to
an existing line ("CO-2 Added gas line" belongs on Trim) and duplicated descriptions. Those are
exactly the rows a contractor moving a job mid-stream has on the sheet. Typing them back in is
where mistakes get into the first application here.

**Choices to keep.**

- Placement works by applying a change in amount, not by recomputing every line from the sheet, so
  figures the contractor typed on other lines survive. The cost is that a line edited by hand and
  then un-placed is clamped at $0.00 rather than restored. That is documented in the helper.
- Rows with no readable amount get no picker. They stay in the high-severity check, to be entered
  by hand.
- Line 6 is unchanged by placement, because it was already computed over every sheet row, matched
  or not.
- No server change and no migration. The file is still read in the browser only.

**Verification.** `pnpm typecheck` was clean. `pnpm test:unit` passed 47 files and 408 tests, with
one new unit test for `placeUnmatched`/`overScheduled` and one component test that places a row,
moves it and checks the PUT body. `pnpm build` passed. Private-repo Actions jobs end in about 2 s
with no log (PR 117 shows the same), so local checks stood in for CI.

**Next on this thread.** Line 5a/5b from a G702 summary sheet in the same workbook, and per-line
retainage released before the move (ROADMAP "Next").
