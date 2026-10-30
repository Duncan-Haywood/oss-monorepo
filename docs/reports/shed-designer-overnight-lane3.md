# Shed Designer overnight, lane 3: editor, 3D viewer and UX

Session: https://claude.ai/code/session_01XpHqyeer9LhNXp1mg3LzQU (2026-10-29). Read-only audit while PR #11268 was open, then two PRs after it merged.

## What landed

| PR | What | Evidence |
|---|---|---|
| #11316 | End view drew the raw form values instead of the built (auto) roof. Eave drag was overridden by the automatic overhang. Arrow keys on every handle, door and window, with focus kept after the redraw. Ctrl+Shift+Z redo. Typing commits once per field and skips half-typed values (typing 16 used to build two 4 ft sheds and leave three undo steps). 44 px touch targets, and an opening keeps its grab point. 3D view: pinch, keyboard orbit and zoom, one draw per frame, labels that don't pile up. Out-of-sight panels drawn after the frame. Broken share links and draw errors say so. Headings fixed for axe. One announcement per change. `browser.test.mjs`, plus the new `shed-designer-browser.yml` workflow (Playwright 1.63.0 + axe-core 4.13.0). | Median time an edit blocks the page (headless, six edits): 85 to 26 ms on the 8x12, 175 to 50 ms on a 40x20. axe: 0 violations on every results tab. `browser-test` green in CI. |
| this PR | The end view takes its picture's own shape and reserves room for four more pitch steps, not always 14/12. On a phone the 8 ft gable end was drawn 76 px wide in a 344 px box (22%), so its three 44 px handle targets overlapped. It is now 144 px; on desktop it went from 119 to 207 px. The wall-height label no longer runs off the right edge on a phone. | New browser test; it fails on the old layout ("the gable end is 22% of the box width") and passes now. |

## How to drive the page

- `node --test browser.test.mjs` in the venture with `PLAYWRIGHT=/opt/node-tools/node_modules/playwright/index.js` (cloud sessions have it there, and the file finds it on its own). Add `AXE=<path>/axe.min.js` for the accessibility test (`npm install axe-core@4.13.0` into the scratchpad).
- The tests use `data-key` hooks: `plan-len`, `plan-wid`, `plan-both`, `end-peak`, `end-wall`, `end-eave`, and `op-<id>` for each opening. They are on the transparent hit targets (`.handle-hit`, `.opening-hit`), not the drawn shapes.
- Touch is driven through CDP `Input.dispatchTouchEvent`, and Playwright's `devices['Pixel 7']` sets the phone context.

## Open, for the next run

- **CI image vs Playwright.** `ubuntu-latest` is Ubuntu 26.04 now. Playwright 1.56.x cannot install Chromium there ("Playwright does not support chromium on ubuntu26.04-x64"). 1.63.0 can, which is why this lane's workflow pins it. `browser-checks-ci.yml` (1.56.0) and `platform/uitest/action.yml` (default 1.56.1) still pin the old one. The nightly Browser checks run has failed on each of 2026-10-27, 28 and 29. Its 2026-10-29 log ends "all 1 browser checks passed" and then fails, so I did not confirm the image is the cause there. Worth a platform run.
- **3D frame time** on a 40x20 is about 92 ms a frame in headless software GL (SwiftShader), against 52 ms on the 8x12. Profiling showed JavaScript at about 1 ms a frame; the rest is rasterising. A real GPU won't share that, so nothing was done. If a phone user reports it, merge the per-layer buffers into one draw per material, or drop the outline pass while orbiting.
- **Label width reads.** The 3D label placement reads each label's `offsetWidth` every frame (about 1 ms). The widths could be cached per `show()`.
- **A steep peak drag** past the reserved room (four pitch steps) leaves the view until you let go, then the view rescales. Fine in practice, but an SVG that grew during the drag would be smoother.
- **Undo is per design.** Switching designs clears undo and redo. That is deliberate, but it isn't said anywhere on the page.
