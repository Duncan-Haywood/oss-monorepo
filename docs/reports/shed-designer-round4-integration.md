# Shed designer, round 4, lane 8: integration captain

Run of 2026-10-30, about 20:20 to 21:55 UTC. Eight lanes merged into `ventures/shed-designer` while CI runs on `main` were mostly cancelled by concurrency, so lanes merged on local checks. This lane swept `main` on a cycle, fixed the breaks forward, and kept the all-pairs matrix up with each new option.

## State of `main` at the last sweep (d48534d3, seed 9203)

| Check | Result |
| --- | --- |
| `node --test` on every non-browser file | 393 pass, 1 skip, 0 fail |
| Browser (`*browser*.test.mjs` and `renders.test.mjs`, axe-core 4.13.0, Playwright 1.63) | 64 of 64 |
| `FUZZ_N=2000`, seed 9203 | 2,000 of 2,000 |
| `node platform/pages/typecheck.mjs shed-designer` | 0 diagnostics (56 files) |
| `make-renders.mjs --check` | all up to date |
| `check_conflict_markers.py`, `check_money_sign.py`, `check_post_frontmatter.py`, `portfolio/router/validate.py` | clean |

The earlier sweeps:
- **a74fca17:** 335 unit tests and 2,000 fuzz designs at seed 4117 passed. Front matter and validate were red, fixed by #11850. The renders were stale, fixed by #11856.
- **7c34b28c:** 360 unit tests and 60 browser tests passed. Fuzz seed 27311 failed 1 of 2,000; see "Handed on".

## What landed from this lane

| PR | What |
| --- | --- |
| #11850 | Fixed `main`. Two posts were over their front-matter caps. Four `flagships.yaml` `next:` entries were over 2,000 characters: einvoice-preflight 2,025, ai-bookkeeper 2,020, wall-framing-takeoff 2,650 and changepoint-detector 3,512. Landed history was cut and every open item kept. |
| #11856 | Renders redrawn. 37 targets were stale; only the 8x12 preset's five pictures changed pixels. |
| #11878 | The matrix gains saltbox, lean-to, `floor: 'none'`, `climate` and `wallTrim: '5/4'` (65 designs). Two cross-lane fixes, below. Two targeted tests: HZ5 or HZ10 by climate on every preset, and the 5/4 haul note. |
| #11889 | shift-roster-builder: `page.test.mjs` split so the engine-heavy guide-page tests run in parallel. The venture suite went from 479 s to 377 s on 4 cores, measured back to back on a quiet machine. |
| #11892 | Fixed `main`. `research_live_links.py` (marine-path README) and `faq-visible.test.mjs` (shift-roster's 14-day notice page) were red; lane 6 reported both through the parent. |
| #11896 | Fixed `main`. `promptctl validate` was red on three run records: one `writeups` string, and two missing or null `pr` fields filled from their merge commits. |
| #11902 | Render manifest refreshed: 27 hashes, every picture byte-identical. |
| #11908 | The matrix gives every design a lot, so the site plan is drawn and not skipped. `insulation`, `siteFacing` and `easementSide` join the axes (72 designs). Post: `docs/posts/2026-10-30-eight-agents-one-shed-designer.md`. |
| this PR | This report and the run record. |

## Cross-lane clashes found

- **5/4 trim and the haul limit (lane 4 × haul limit).** LP 540 comes in 16 ft only, and the default `maxHaulFt` is 12. When no stock fits the limit, `cutWithinHaul` falls back to the long stock without saying so, and the summary's haul line looks only at framing lumber. So 5/4 trim quietly bought 16 ft boards. #11878 adds an estimate note; prices and defaults are unchanged.
- **Floorless and the teen bedroom (lane 5 × interior).** The rug and beanbags sat at `floorTop`, which with no floor is the timber top, 5-1/2" above the gravel. #11878 puts them at z = 0. After lane 5's #11904 merged, the fix is still on `main` (`rugZ` in `model.mjs`).
- No pairwise clash among the 72 matrix designs after those fixes.

## Times `main` went red tonight

None of these came from shed-designer code. Every one turned every open PR red, whatever the PR touched.

| Check | Cause | Fixed by |
| --- | --- | --- |
| `check_post_frontmatter.py` | #11839 seo_title 75, #11838 description 161 | #11850 |
| `portfolio/router/validate.py` | four flagship `next:` entries over 2,000 | #11850 |
| `research_live_links.py` | `research/marine-path/README.md` without a live link | #11892 |
| `platform/pages/faq-visible.test.mjs` | 14-day notice page's visible FAQ drifted from its JSON-LD | #11892 |
| `promptctl.py validate` | three run records (writeups shape, `pr` null or missing) | #11896 |

**Lesson, same as round 3's with two additions.** Before merging on local checks, also run:
- `python3 platform/ci/research_live_links.py`;
- `node --test platform/pages/faq-visible.test.mjs` when an FAQ changed;
- `python3 prompts/promptctl.py validate`.

Each takes seconds.

## Render drift

Twice tonight a batch of hashes moved after other lanes merged model code: 37 targets, then 27. The first redraw changed pixels in five pictures; the second changed none. Since #11625 this is a warning, and the site build redraws before deploying. A lane that touches `model.mjs` does not need to redraw for the site's sake. A lane that wants `--check` green does.

`renders/` is at 1,011 of its 1,100 KB budget, so the next preset with five views will need a budget decision.

## Handed on

- **Fuzz seed 27311, design 591 (lane 4, finishes).** An 8x24 fiber-cement shed with two front doors 26" apart (45" at 145", 49" at 216"). Lap course 1 runs the full 288" wall, notched by both doors (141.5 to 193.5 and 212.5 to 268.5). With 144" planks it needs a joint between 142" and 264", and the only clear stretch (193.5 to 212.5) has no stud. `layoutFace` falls back to an unbacked joint, and "Lap butt joints on studs" fails honestly. It is not new: it reproduces on 7dfcbf2a, before round 4. The likely fix is a lap-joint nailer, as `model.mjs` adds for panel siding on the 48" grid. That needs the lap layout to feed back into the framing, so it is lane 4's call. Messaged. Reproduce: `cd ventures/shed-designer && FUZZ_N=2000 FUZZ_SEED=27311 node --test fuzz.test.mjs`. The nightly fuzz will go red on any night whose seed reaches a design like it.
- **shift-roster-builder `calc.test.mjs`** is now the suite's floor: one serial file of about 140 tests. Its slowest are:
  - the exact bound, 48 s;
  - the proven sample week, 32 s;
  - two `coverRepair` tests, 29 s each;
  - the balance test, 23 s.

  Splitting it the same way as #11889 would cut more.

## Deviations

- **The front-door mirror packing debt (round 2, lane 2) was not worked.** The packer shards the mirror into `gitops/prod` ConfigMaps. CLAUDE.md says the Hetzner/k3s origin those manifests describe was retired on 2026-10-01. Stabilising a packer for a dead origin is not worth agent time. The better question for whoever owns `platform/marketing` is whether the mirror and its tests can be retired.
- **The 20-minute sweep cadence slipped to 25 to 40 minutes.** Fixes to `main` came first. All three sweeps ran the full list.

## Open round-4 PRs at the end of this run

#11869, #11868, #11876, #11879, #11897 (lane 3), #11905 (gambrel). None touches the matrix's axes except #11897 (attic storage and lofts as search knobs) and #11905 (barn knobs in the search). When they land, the search-front test in `crossfeature.test.mjs` already runs whatever the search returns.
