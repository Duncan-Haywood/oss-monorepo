---
kind: analysis
date: 2026-11-03
tagged: auto
---
# Homepage frame rate (2026-11-03)

Owner report: "tons of lag on the site". Cause: client-side rendering on the
homepage hero, not the server (TTFB 0.45 s).

## Measured (headless Chromium, CPU throttled 4x laptop / 6x phone)

| page | before idle | before scroll | after idle | after scroll |
| --- | --- | --- | --- | --- |
| `/` laptop 1440x900 @2x | 7 fps, p95 383 ms | 44 fps, p95 133 ms | 52 fps, p95 33 ms | 48 fps, p95 50 ms |
| `/` phone 390x844 @3x | 12 fps, p95 133 ms | 42 fps, p95 100 ms | 50 fps, p95 33 ms | 46 fps, p95 50 ms |
| tool pages | 60 fps | 60+ fps | unchanged | unchanged |

Ablation on the shipped page (idle fps): baseline 5.3, no aurora 15, no canvas
7.7, neither 56.7. After the aurora fix, canvas at 1x vs 1.5x: 52 vs 24.

## What changed

- `platform/pages/showcase.mjs`: aurora uses radial gradients, not
  `filter: blur(70px)` with `mix-blend-mode`; pauses when the hero is off
  screen. Canvas: 1x resolution, lines batched in 4 paths, no `shadowBlur`,
  ~30 fps, up to 90 points. No `backdrop-filter` on hero stats, no text
  sheen, pointer light coalesced per frame.
- `platform/pages/home.mjs`: no `backdrop-filter` on `.rcard`.

## Guards

- `platform/pages/framerate.mjs`: browser check, exit 0/1/2 like the others.
  `PLAYWRIGHT=$(node -e "console.log(require.resolve('playwright'))")
  BASE_URL=https://marisstella.app node platform/pages/framerate.mjs`.
- `showcase.test.mjs`: static test for the patterns (runs in CI).

## Not done here

`framerate` is not yet in `browser_checks.py`'s nightly registry. Registering
it touches `.github/workflows/browser-checks-ci.yml` (control plane, owner
approval), so it is a separate PR. Venture pages were not swept beyond the
three showcased tools; `PAGES=` takes any list.
