---
kind: polish
topics: [design, guardrails]
date: 2026-11-14
---
# Polish 2026-11-14: research index's "0 runtime dependencies" tile was false

Track: polish/0.

## How it was picked

- Took item 2 of `polish-2026-11-14-research-entities.md` first (the product-side `&amp;entity;`
  sweep). Full `build.mjs` at 77d5d1d50: outside `writing/` and `updates/` the only hits are
  deliberate ones (`structured-data-drift-check` explains `&amp;mdash;`; the changelog quotes a
  PR title). The blog side is open PR #15910. Nothing to fix there.
- The blog meta row (item 3 of the footer-contrast note) landed in #15905.
- Screenshots of the hub, wall-framing-takeoff, ai-bookkeeper, research, stories, writing and one
  post at 390 and 1,280 px: no sideways scroll on any. The research hero's fourth tile read
  "**0** runtime dependencies", a literal in `research/_homepage/template.html`.

## What I measured

All 1,080 project folders, every `.py` outside `tests/`, top-level `import` / `from` names that
are not in `sys.stdlib_module_names` and not a file or directory name anywhere under `research/`:

- 618 import no third-party package; 462 do.
- Most common: numpy 424, matplotlib 204, scipy 127, sklearn 54, mujoco 40, skfem 33, cma 25,
  shapely 21, torch 11, pandas 10.
- `linefig` (320 projects) is `research/_shared/linefig.py`, stdlib only, so it is counted as the
  repo's own code, not a dependency.
- Cross-check: 0 projects counted dependency-free have a `requirements.txt` naming a package
  (other than pytest).

## What changed

- `build.py`: `third_party_imports(slug)` and a `{{STDLIB_COUNT}}` placeholder; build time 1.8 s
  to 2.5 s.
- `template.html`: tile is `{{STDLIB_COUNT}}` "need only the Python standard library".
- `test_research_homepage_publish.py`: `test_dependency_tile_is_measured_not_typed`. Fails on
  the old builder (FAIL), passes on the new one (6 tests OK).
- Screenshots (`.stats`, 2x): `img/polish-2026-11-14-research-deps-{390,1280}-{before,after}.png`.
  The new label wraps to two lines at 1,280 px, the same height as the other tiles.

## Still weakest, and what I would do next

1. **Other typed claims in templates.** `grep -nE '<b>[0-9]' research/_homepage/*.html` and the
   hub's hero in `platform/pages/home.mjs`: any number that is not a placeholder is a claim that
   will go stale. A check that rejects literal numbers in stat tiles would keep them honest.
2. Per-project pages could show the measured dependency list ("Needs: numpy, scipy") beside the
   test count; `third_party_imports` already returns it.
3. Carried over: `contrast.mjs` fallback without axe-core (still absent at
   `/opt/node-tools/node_modules`); TeX-ish text outside code spans in ledes; answer leads on
   ~22 tools.
