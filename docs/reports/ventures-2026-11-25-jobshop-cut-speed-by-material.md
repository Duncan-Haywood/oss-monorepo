---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): cut speed per material and thickness

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#176 (merged).
Claim slug `geometry-cut-speed-by-thickness` (ROADMAP item 5).

**Why this item.** Bet #1 (payapps) Next items were claimed, conditional on a customer asking, or
needed an OCR dependency the private repo forbids adding unasked. Bet #2 item 5 named "cut speed
per material and thickness instead of one per machine", and the sheet-thickness column from
private PR #167 made it a clean key.

**What landed.** `cut_speeds` (migration 0018: org, machine, material, in/min, optional pierce s;
unique per machine+material), `PUT/DELETE /rate-card/cut-speeds` (admin; both rows must be the
org's and active; non-cutting kinds refused unless the machine already has a default cut speed),
`RateCardDto.cutSpeeds`, `suggestCuttingOperation(flat, machines, material, speeds)` and a "Cut
speeds by material" card on the rate card. Marketing FAQ (jobshop-site pages.ts) mentions it.

**Choices the next run should keep.**

- Keyed on the material row, not a name/family match: a row already is alloy + thickness.
- Rows for the line's material win: the machines with a row are the candidates (exactly one must
  remain). This resolves "laser + plasma both have a default speed" when the shop says which one
  cuts that material. No row: the old single-default rule.
- Rows on machines not in the active list are ignored.
- Never assume a speed from a published chart.

**Next.** CSV import/export of the speeds (rate-card-import has no shape for a two-key row yet);
tapping, drilling time by diameter; IGES/STL.

**Verification.** `pnpm typecheck`, `biome ci .`, unit 275 passed, worker 157 passed (new
`test/worker/cut-speeds.test.ts`: replace, delete, mill/zero/estimator refused, cross-tenant
404s, end-to-end quote), `pnpm build`; all local (private CI has no runner). jobshop-site unit 42
passed.
