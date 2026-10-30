# Shed designer, round 4, lane 7: cross-reference and UX polish (2026-10-30)

The brief came from the "Open" sections of `shed-designer-round2-lane3.md`, `shed-designer-round3b-lane4.md` and `shed-designer-round3-looks.md`, plus a fresh first-time-user pass on desktop and a phone. Two PRs: #11855 (cross-reference and polish) and the first-time-user PR that carries this report.

## Done

- **"Show in 3D" for everything drawn** (`xref.mjs`). A table maps each shopping line's price key (`source.key`) to the panel kinds and fixture kinds drawn for it. Drip edge maps to the fascia, house wrap to the wall sheathing, and door hardware ("(door o1)") to that door. Every fixture now has an id (`FX…`), and door and window fixtures carry `op` (their opening id). On the default 8x12, 42 of 49 lines have the button, against 12 before. The lines without one aren't drawn: nails, caulk, Z-flashing, adhesive and the tamper.
- **3D picking finds panels and fixtures.** `pick` in `render3d.mjs` tests every solid with an id on a visible layer, not just `shown.members`. A click on the siding names the siding and lists the shopping lines that buy it ("Bought as: …"). The structural-colour mode still picks only members, because `solidsOf(shed, heat)` returns members only.
- **Door-frame parts have geometry.** In `model.mjs`, each site-built door's stiles, rails and Z braces are drawn flat (1.5") on the back of the door slab, inside the opening. The braces run corner to corner of each bay, with the low end on the hinge side (the outer edge of each leaf). They are drawn on the siding layer in framing colour. Parts-list "Show in 3D" for door marks now works.
- **Opening costs: measured, no cache built.** 15 openings take 107 ms once warm and 3 take 18 ms (`openingCosts`, node). The run is debounced 400 ms and already cached per design, so a per-opening cache would add code for nothing. This is a deviation from the brief, recorded here.
- **Catalogue range by area.** Given a height, `catalogueRange(kind, width, height)` keeps the units within a third of the rough-opening area, and at least the three nearest. A 14 x 21 now gets $51.95 to $57.90 (it was all 8 windows, $47.75 to $86.45).
- **Siding note.** The note now prices the next 12" of wall in half-inch steps: the panels as bought now, against the new layout with strips counted unnested (an upper bound). It appears only when a taller wall is cheaper by at least $1, and it says by how much. My first version counted the current strips unnested too and over-claimed, and the existing 8x8-lean unit test caught it. It now shows in 1 of 168 preset × wall-height combinations (8x12 lean-to at 112"; 2" taller saves about $35 on panels and $11.56 on the whole shed).
- **Sticky bar.** While any `.handle-hit` is under `#jump`, the bar gets `.over-handle` (30% opacity, `pointer-events: none`), checked on scroll and resize once per animation frame.
- **Compare tray** is `position: fixed` at the bottom, centred, at most 760 px wide. The body gets bottom padding while the tray shows, and the tray is hidden in print.
- **Usage:** opening a gallery detail counts `details`, not `compares` (`usage.mjs` EVENTS, README line).
- **Window glass:** `FINISH.glass` (256) gives a sky gradient by height (haze below, blue above) with a faint diagonal glint, and is shaded at only 40%. It is drawn in the SIDING shader variant only.

## First-time-user pass (desktop 1366x900, phone 390x844)

Starting from the gallery: open "10x10 to match the house", start from it, leave lines out, read the cut sheet, open the HOA packet, print.

| Confusion | Fix |
|---|---|
| The gallery said "Ten sheds" while the strip counted "1 of 11"; "six" lap designs where there are seven | The count is computed from the list (`#gallery-count`) |
| Cards had no visible cue that they open; the only button said "Compare" | Each card ends "See all sides, cost and storage →" |
| On a phone, a 9-line explanation pushed the first card below the fold | One short sentence, with "How these were picked" folded into a `details` |
| The card says $3,307 and the bar then says "Total $3,556" | The bar says "Total incl. tax + delivery" (or whichever it includes) |
| On a phone, "Have it" and "Leave out" were past a sideways scroll in the shopping table | Below 600 px each line is a small card with both boxes on screen |
| The HOA packet was the third button in the Plans tab | "HOA packet" is in the sticky section bar |
| "Print all" printed the "Show in 3D" buttons, empty tick-box columns, the store comparison and a blank quote form (44 pages) | Hidden in print: 40 pages, no screen controls |
| The 3D hint said "click a board" | It now says a board, sheet, siding course or the roof, and what it is bought as |

Seen and left for other lanes:
- **Lane 3:** gallery reasons say "the cards above" in a horizontal strip, which should read "the other cards".
- **Lane 4:** the packet's "Door finish: stained wood" for a door "built from the siding" on a painted-lap design reads oddly.
- **Lane 6:** the HOA packet PDF is 6 pages for 5 sheets, so check for an empty last page.

## Open, next steps

- **Hurricane ties and hangers on some roofs have no drawn fixture**, so those lines have no "Show in 3D". Connectors are drawn only where `model.mjs` draws them.
- **"Bought as" can list loosely related lines.** A hinge's box also names flashing tape and shims, because those map to doors and windows. A per-opening split of tape and shims would tighten it.
- **The phone shopping card's "Have it" and "Leave out" words are CSS `::after` text**, so tapping the word doesn't toggle the box. The box is 22 px and has its own `aria-label`. Turning the words into `<label>`s would mean changing `renderShopping`'s markup.
- **Axe was not run locally** (no axe-core in the container). CI's `browser-test` runs it.

## How to drive it

`#shopping button[data-xref-line]` (with `tr[data-line]`), `#xref` ("Bought as: "), `#jump #jump-hoa`, `#total-pill-l`, `.hint-more`, `#jump.over-handle`, and `localStorage['shed-designer-details']`. `xref.test.mjs` covers the mapping, unique ids, door-frame geometry and the siding-first pick.
