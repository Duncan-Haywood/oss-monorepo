# Shed Designer: one WebGL frame per off-page picture (2026-11-16)

Perf track. Takes item 1 of "Not changed" in
[`ci-perf-2026-11-16-shed-gallery-parallel-once.md`](ci-perf-2026-11-16-shed-gallery-parallel-once.md):
`browser.test.mjs`, the largest shed-designer file, never profiled since it went
four at a time on 2026-11-11
([`ci-perf-2026-11-11-shed-browser-concurrent.md`](ci-perf-2026-11-11-shed-browser-concurrent.md)).
Both open perf backlog items (P063, P064) touch workflow files and still wait
for the owner.

## Reading

`time node --test browser.test.mjs` from `ventures/shed-designer` on the 4-core
cloud container (Node v22.23.4, Playwright from `/opt/node-tools`, no `AXE` so
the axe test skips): 69.5 s, 43 pass. Each test takes 3.6 to 12 s at four at a
time.

Where the CPU goes: sampling `ps` every 0.5 s during the run and keeping each
Chromium process's last cumulative CPU time gave **GPU process 92 to 100 s and
renderers 92 to 99 s** for a 70 s run on 4 cores: the machine is full, and half
of it is SwiftShader (the tests launch Chromium with `--use-gl=swiftshader`, as
the workflow does). Node itself is under 15 s.

One page load, on its own (a scratch script doing what the file's `open()` does,
with a CDP CPU profile of the page): 1.3 to 1.4 s until the total shows, about
1.5 s of main-thread JS in all, `snapshot` (the `toDataURL` read-back) 355 ms
self.

## Profile: frames per picture

Counting `WebGLRenderingContext.clear(COLOR)` calls (one per frame) on page load
showed **11 frames for 3 pictures**:

| canvas | frames | from |
|---|---|---|
| the 3D view (on the page, 653x489) | 2 | `show()`, then the first `ResizeObserver` callback at the same size |
| the gallery card shot (off-page, 600x400) | 4 | `show()`, `view()`, `snapshot()`, then its own `ResizeObserver` callback |
| the compare thumbnail (off-page, 720x480) | 3 | `show()`, `snapshot()`, `ResizeObserver` |

An off-page canvas is only ever seen through `snapshot()`, which draws before it
reads back, and every `draw()` clears and repaints from the viewer's state. So
every frame before the snapshot's was thrown away. After one edit: 5 frames,
of which the thumbnail's `show()` frame was again wasted.

## Change

`render3d.mjs` only, `draw()` untouched (its source is part of the renders hash
in `make-renders.mjs` `rendererSource()`, so editing it would mark every stored
picture stale):

- `show()`, `view()`, `reset()`, `setLayer()`, `setDimensions()`,
  `setOutlines()`, `setScenery()`, `highlight()` and `setPosterImage()` call a
  new `paint()`, which draws only while the canvas is on the page. `snapshot()`
  still always draws.
- The `ResizeObserver` callback draws only when the canvas is on the page and
  either nothing is drawn yet or its CSS size no longer matches the buffer.
- `requestDraw()` (pointer input), the glitter loop and the returned `draw`
  (used by `make-renders.mjs` on an on-page canvas) are unchanged.

Frames on load 11 to 5 (one per picture plus two `toDataURL`), after an edit 5 to 4.
The same holds for the option cards, the cheaper-build and goal-pick cards and
the HOA packet's perspective (each `show()` + `snapshot()`, or `show()` +
`view()` + `snapshot()`, on an off-page canvas).

## Verification

- **Same pictures.** A scratch Playwright script hashed every `toDataURL` the
  page made, plus the 3D view's own pixels, on load, after an edit (length 12 to
  14 ft) and after "make options" (8 option cards): 14 images, every hash equal
  between `HEAD`'s `render3d.mjs` and the new one.
- **Same tests.** `browser.test.mjs` 43/43 pass in every run below;
  `picker.browser`, `gambrel.browser`, `hoa.browser`, `utilisation.browser` and
  `renders.test.mjs` 25 pass, 1 skipped (axe), 0 fail;
  `python3 platform/ci/run_venture_tests.py shed-designer` (the CI command)
  passes (output in the run record's notes).

| `browser.test.mjs` | wall | GPU process CPU | renderer CPU |
|---|---|---|---|
| before, 4 runs | 69.5, 72.0, 73.6, 76.1 s (mean 72.8) | 92, 95, 100 s | 98, 99, 92 s |
| after, 3 runs | 64.5, 66.7, 72.1 s (mean 67.8) | 69, 77 s | 90, 113 s |

Runs alternated before and after (`ab.sh` in the run's scratchpad: copy one
version in, run, sample `ps`). Wall time is about 7% lower and noisy; the GPU
process's CPU, which is what the change removes, is about a quarter lower.
Renderer CPU is within noise. The same frames are saved on a visitor's machine
with a real GPU: the first visit draws 5 frames instead of 11.

## Not changed, ranked for the next run

1. **The on-page view draws twice per typed edit** (`fill` then `Tab`: the
   `input` and `change` events each commit and render). That is app behaviour,
   each render shows a real state; coalescing them would change undo steps.
2. **`snapshot()`'s PNG encode** (355 ms self per load, two read-backs). JPEG or
   WebP would be smaller and faster but changes the pictures' bytes; the thumbs
   are `<img>` data URLs, so it is a product choice.
3. **Renderer main thread on load** (about 1.5 s: `buildShed` 413 ms, the store
   comparison 253 ms, gallery facts for 26 cards 116 ms). `renderStores` already
   runs after the first frame; the gallery facts are the strip's content.
4. fuzz.test.mjs (27.6 s) and picker.browser.test.mjs (26.4 s): not profiled.
5. P063 and P064 remain owner-gated (workflow files).
