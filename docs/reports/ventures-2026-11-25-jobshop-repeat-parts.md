---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): repeat parts, earlier quotes of a part number and their inputs

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#110 (merged).

**Why this, and why not bet #1.** This run first built PayApps' "weekly email at the member's own
hour and time zone" (roadmap: Weekly email, part 3). A sibling session merged the same item as
private PR 106 about five minutes before this run pushed, on the *same branch name*
(`claude/payapps-digest-time-zone`). Its version was complete, so this run dropped its own copy
and moved to bet #2, where no branch claimed roadmap item 9. The lesson for the next run: on
PayApps, push an empty claim branch (or open a draft PR) **before** writing code. A free branch name
at the start is no guarantee by the end.

**What landed.** Job shops quote the same part numbers again and again: a customer reorders a
bracket, or re-sends an RFQ with a new revision. Each quote line now shows "Quoted before: N
earlier quotes of <part number>". These are the shop's own quotes of any status, newest first, at
most 10. Each one shows:

- the quote number, customer and date;
- the outcome: the PO number if won, the reason if lost;
- the revision, flagged when it differs from this line's;
- the unit price at each quantity break;
- the material and operations as quoted, with machines retired since marked as retired.

"Use these inputs" copies that line's material, blank, operations, finishing and extras onto the
draft line. The line keeps its own quantities and is priced from **today's** rate card.

**Choices the next run should keep.**

- Inputs are reused; prices never are. The old unit prices are shown for reference only. That
  keeps the app's core rule: prices come only from the rate card through the pure engine.
- A machine retired since the old quote still prices at its current card rate. That matches how
  every line that uses a retired machine already behaves. The history marks it "retired" so the
  estimator notices.
- Part numbers are matched only by case and spacing. `ABC-100` and `ABC100` stay different parts,
  because a dash can matter.
- The copy goes through `updateLine`, so it inherits the draft-only guard, the revision bump and
  the 409 once a quote is sent. A source line from another shop is a 404 (tested).

**Next** (private ROADMAP item 9, part 2): show the history on the RFQ review screen before a quote
exists, and, opt-in per shop, pre-fill a new quote's line from the last won quote of the same part
and revision.

**Verification** (local; private Actions has no runners):

- `biome ci .` clean and `pnpm typecheck` clean.
- Unit tests: 85 passed. Worker tests: 60 passed, including 3 new repeat-part tests.
- `pnpm build` ok. `drizzle-kit check` ok, with no migration because there is no schema change.
