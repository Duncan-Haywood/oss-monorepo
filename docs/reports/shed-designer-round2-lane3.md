# Shed Designer round 2, lane 3: editor UX and clarity

Session: https://claude.ai/code/session_01XpHqycJA9kKp6yr4akmWLq (2026-10-30). Built from the "Open" sections of round 1's lane 3, 4 and 5 reports.

## What landed

Six stacked PRs, each with a browser test that fails on the code before it (except where noted) and passes now.

| PR | What | Evidence |
|---|---|---|
| #11518 | A cleared or junk number box keeps the design's last value. Leaving the box puts that value back, with no rebuild and no undo step. Opening fields too. | Browser test: wall height, length and an opening's width. |
| #11532 | A site-built door warns when its Z brace runs under 25 or over 65 degrees (a 12" leaf gave 1 degree). **Bug found on the way:** typing a size on a site-built door silently switched it to "Custom size". It now stays site-built. | Unit test (starting door 47 deg, 60" pair 56, 12" leaf 1, 20" leaf 70) and a browser test. |
| #11533 | `estimate().notes`: a siding note with the panel prices and column counts, explaining why 114" walls on the 8x8 cost less than 112" ($2,880.00 against $2,911.31). The status line and the Undo tooltip say undo is per design. | Unit test pins the price step; browser test. |
| #11534 | A steep peak drag grows the end view's viewBox upward as you drag, in the same coordinates. 3D label sizes are read once per `show()`. | Browser tests: the viewBox stayed at 192.5 before; 74 `offsetWidth` reads for 18 labels over 8 frames before, at most one per label now. |
| #11535 | `catalogueRange(kind, width)`: custom-size openings show a typical range (single doors $246 to $615 across 5; doubles over 44" $465 to $585 across 2; windows $47.75 to $86.45 across 8). A new box, `customRange` (off by default), counts each at the range median as a line marked "estimate", with no listing link. | `prices-honesty.test.mjs`; browser test. |
| this PR | First-time-user pass. Phone: the cost panel starts about 1,340 px (1.6 screens) below the plan, so a floating total pill shows while the panel is off screen. Desktop: `.editors` no longer stretches to the 3D column's height, which had left large blank areas and pushed the end view below the fold. Blog post. | Browser test: the pill shows and matches the total, sits over no plan handle, and hides when tapped; on a laptop the plan's section is under 160 px taller than its drawing. |

Also #11521: fixed `main`, where wall-framing-takeoff's `next:` in `flagships.yaml` was over its 2,000-character cap, which turned `validate` red on every PR.

## Open, for the next run

- **The pill and handles.** On a phone, a handle can scroll under the pill (bottom right). The test checks only the starting position. If it bites, hide the pill while a pointer is down on an editor.
- **Catalogue range is coarse.** Windows are compared with all 8 windows whatever their size, so a 14 x 21 and a 24 x 36 share one range. With more units, filter by rough-opening area.
- **Quote emails** list an opted-in custom opening as "custom size: typical range ... counted at the median". That reads honestly to a store, but it could instead ask "please quote a unit for this rough opening".
- **Siding note** is shown whenever a 9 or 10 ft panel or a strip is used, which is nearly every design. A sharper version would price the next wall step and only say so when it is cheaper.
- **Starting design warns.** A first-time visitor's very first view has a "Check these" warning (the peak is over the 8 ft limit). That is the owner's spec, and the warning says how to fix it, but it is the first thing a newcomer reads.
- Axe was not run locally (no axe-core in the container). CI's `browser-test` runs it.

## How to drive the page

As in round 1's lane 3 report, plus: `#total-pill` and `#total-pill-n` for the floating total; `#customRange` for the range box; `input[data-i="0"][data-k="height"]` for opening fields. Scroll an editor into view (`scrollIntoViewIfNeeded`) before driving it with the mouse; at 1366x900 the end view starts below the fold.
