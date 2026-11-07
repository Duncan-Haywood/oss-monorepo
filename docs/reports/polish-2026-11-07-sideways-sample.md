# Polish 2026-11-07: sideways-scroll sample sweep, three causes fixed

**Checked.** Full build, then a 390 px probe of 374 pages (150 writing, 100 research, ~120 other top-level
pages, the hub) and a second `SAMPLE=400` run of `sideways.mjs` at 360 px. Followed up the previous note's
"Next" (probe more page types, make it routine).

**Found and fixed (3 causes, 4 pages in the samples, same cause behind many more).**

| page | before (scrollWidth) | cause | fix | after |
|---|---|---|---|---|
| `/research/marine-dr/` | 663 at 390 | a bare 150-character URL in a log `<li>` cannot wrap | `overflow-wrap:break-word` on `.wrap` in `research/_homepage/project.html` and `topic.html` | 390 |
| `/research/society-converts/` | 362 at 360 | same family | same | 360 |
| `/independent-pharmacy-rx-margin-calculator/` | 484 at 390 | `.sr` (position:absolute) labels inside a `display:block; overflow-x:auto` table escape its clipping because the table is not positioned | `position:relative` on `table` in the `mobile-overflow-guard` snippet (60 venture pages carry it) | 390 |

Verified by rebuilding the research pages (`research/_homepage/build.py --out`) and patching the one
built tool page; not re-run through the full build. No ranking or traffic claim.

**Tool.** `sideways.mjs` gained `SAMPLE=N` (N pages spread evenly, a couple of minutes) and its "widest box"
report now ignores boxes inside a scroller. Before this it named clipped nav links as culprits, which sent
the first diagnosis the wrong way.

**Next.** Run `SAMPLE=400` at `WIDTH=320` (WCAG reflow); the guard snippet is hand-pasted into 60 pages, so
moving it into the shared chrome (`pf-chrome.css`) would be one fix instead of 60.
