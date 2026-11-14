---
kind: polish
subjects: [wall-framing-takeoff, service-load-check, platform/pages]
date: 2026-11-14
tagged: auto
---
# Polish 2026-11-14: drop-downs that cut their own text

**Why this surface.** The first two items of `polish-2026-11-13-uk-ltd-lead.md` "Still weakest" had
already landed (economic-nexus-threshold-tracker has its lead; `.answer-source` has the ≤480 px
rule). So I screenshotted the hub, the top flagship (wall-framing-takeoff), ai-bookkeeper, the
research index, Stories, the blog index and a post at 390 and 1,280 px. The hub, research, writing
and post pages looked finished. The flagship did not: at 1,280 px its settings grid read
`8 ft wall (92-5/8" precu`, `Every plate ends at the`, `Standard (3-stud corne`, and its openings
table read `windo`, `Fron`, `Righ`, with `2×10` touching the arrow. A native `<select>` can't
wrap, so text that doesn't fit is cut mid-word, and no existing check sees it (axe has no rule for
it, `sideways.mjs` only measures page width, file checks see the full text).

## Measured

New `platform/pages/select-clip.mjs` (Playwright, serves `dist` on a free port, third-party
requests blocked, reduced motion). It compares the selected option's text width in the select's
own computed font with the client width less padding and a 20 px arrow. I checked by eye that a
7 px overflow is visible (continuous-beam-calculator: `Rectangle (sawn, LVL, glulam` without its
`)`). Built site, 606 pages carry a `<select>`:

| | pages cutting a default choice | clipped selects | of which under 90 px ("crushed") |
|---|---|---|---|
| 390 px before | 139 | 268 | 70 |
| 390 px after | 135 | 206 | 6 |
| 1,280 px before | 192 | 379 | 59 |
| 1,280 px after | 188 | 347 | 34 |

Sideways scroll on the 227 pages that had any clipped select, at 320, 390 and 1,280 px: 3 pages at
320 px both before and after (merchant-cash-advance-true-cost-calculator, open-robot-mower,
rental-fleet-size-optimizer, 19 px each). That predates this change, which doesn't affect it.

## What changed

1. **Shared: `platform/pages/select-fit.mjs`** (in `pf-chrome.css`, after `REFLOW_CSS`):
   `@media screen{:where(td>select,th>select){min-width:calc-size(max-content,min(size,15em))}}`.
   Ventures set `width:100%` on every control. In an auto-layout table that gives the select almost
   no min-content contribution, and on phones `reflow.mjs`'s `min-width:0` takes away the rest. So
   service-load-check painted 31 px selects showing only the arrow. The rule is a capped floor: it
   only ever widens a select, and it has zero specificity, so a venture's own `min-width` still
   wins (tip-pool-compliance-calculator keeps its 84 px). **The first draft had no cap**, and at
   1,280 px service-load-check's Kind column grew to about 580 px and pushed its table past the card
   (screenshot below). The cap fixed that. `calc-size()` has been in Chromium since 129. Firefox and
   Safari drop the declaration and keep today's layout.
2. **wall-framing-takeoff:** `.edit select` gets the same capped floor (14em) because its own
   `min-width:64px` outranks the shared rule. Wall height, Plates at corners and Advanced framing
   span two grid tracks from 480 px up, where the grid has at least two columns. Option text is
   unchanged because `panels.mjs`, `sheathing.mjs` and three guides quote it.

Test: `platform/pages/select-fit.test.mjs` (order after `REFLOW_CSS`, zero specificity, floor not
width, cap present, `clipped()` and `summarise()` arithmetic).

Screenshots: openings table 1,280 [before](img/polish-2026-11-14-select-clip-wft-openings-1280-before.png) ·
[after](img/polish-2026-11-14-select-clip-wft-openings-1280-after.png); 390
[before](img/polish-2026-11-14-select-clip-wft-openings-390-before.png) ·
[after](img/polish-2026-11-14-select-clip-wft-openings-390-after.png); settings 1,280
[before](img/polish-2026-11-14-select-clip-wft-settings-1280-before.png) ·
[after](img/polish-2026-11-14-select-clip-wft-settings-1280-after.png); service-load-check 390
[before](img/polish-2026-11-14-select-clip-service-load-390-before.png) ·
[after](img/polish-2026-11-14-select-clip-service-load-390-after.png), 1,280
[before](img/polish-2026-11-14-select-clip-service-load-1280-before.png) ·
[after](img/polish-2026-11-14-select-clip-service-load-1280-after.png).

## Still weakest, and what I would do next

1. **The row-grid bid calculators.** gutter-cleaning, window-replacement, hood-cleaning,
   carpet-cleaning, tree-service, snow-removal, flooring and deck all build each row as a grid of
   `<label><span class="lbl">…</span><select>` with narrow fixed tracks, so the shared table rule
   doesn't reach them. That's 34 crushed selects at 1,280 px. They look like one template: fix the
   track sizes once in each (or share the row CSS) and re-run
   `ONLY=… node platform/pages/select-clip.mjs`.
2. **Long option labels in one-column phone layouts** (changepoint-detector, chant-forge,
   league-schedule-generator, wall-framing-takeoff's Advanced framing at 390 px). Here the fix is a
   shorter visible label with the detail moved to help text. Check tests and guides that quote the
   option first.
3. **shed-designer (22 clipped)** and clothing-design-studio (8): studio UIs with dense control
   rows. Worth a look as flagship-grade pages.
4. The three 19 px sideways pages at 320 px above (same width each time, so probably one shared
   element).
5. Carried over: the shared `.jump` component (new class name; self-hosted fallback); `MAX_LINKS`
   8 → 6; topic-page titles four lines on phones; the ticker's third line at 320 px.
