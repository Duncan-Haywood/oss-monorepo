---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): sheet blank from a DXF flat pattern

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#167 (merged).

**Why this item.** Bet #1 (payapps) Next items were claimed or conditional; bet #2 item 5's
"sheet-metal blank (the DXF's flat size × a sheet thickness)" was free. Claim slug
`geometry-sheet-blank`.

**What landed.** `materials.sheet_thickness_in` (migration 0017), `sheetThicknessIn` in the
material schemas/DTO, a rate-card form field, an import/export column ("Sheet thickness (in)";
headers with mm or gauge are refused), pure `blankFromFlatPattern` (costing.ts) and
`flatBlankMeasures` (geometry.ts), and the pre-fill in `createQuote` (services/quotes).

**Choices the next run should keep.**

- The thickness lives on the material row, so "the sheet the estimator picks" is the material
  choice. The engine's `RateMaterial` is unchanged; the quote service reads thickness separately.
- Flat width/height rounded up to 1/8 in, thickness unrounded, longer side = length.
- No nesting margin: nest loss belongs in the material's scrap %.
- Gauge is never converted (gauge tables differ by metal).
- Low bounding-box confidence (assumed units) gives no blank.

**Next (item 5).** A per-sheet material priced by nest yield; cut speed per material and
thickness (the thickness column now exists to key it on); tapping and drill time by diameter.

**Verification.** typecheck, `biome ci .`, unit 262 passed, worker 145 passed, build; all local
(private CI has no runner).
