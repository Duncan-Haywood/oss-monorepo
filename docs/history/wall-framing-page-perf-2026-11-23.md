# Wall Framing Takeoff: plan sections and download-only modules load when used (2026-11-23)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf backlog
items (P063, P064) touch workflow files in `.github/CODEOWNERS` and wait for
the owner. The babysitting-kit pass this morning ranked wall-framing-takeoff
first in its "not changed" list, so this run took it.

## Reading (before)

`node platform/perf/module-weight.mjs .` on `dc4a7b176`: wall-framing-takeoff
**238 kB gzip over 35 files**, third after shed-designer and ai-bookkeeper
(both already had passes). `module-exclusive.mjs` showed most of the weight in
plan sections: roof 16 kB, sheathing 15, budget 14, deck 11, schedule 10,
insulation 8, foundation 8, siding 7, and stairs/floor (20 kB and 14 kB,
shared between them, so 0 kB exclusive each).

The page is one long form. `run()` (synchronous, called on every input) only
calls a section's module when the plan has that section (`plan.roof`,
`plan.deck`, ...). The example plan, which a first visit shows, has none of
them: only walls, openings and stock. A scratch script that treats a set of
modules as lazy and re-walks the graph gave, for the 13 section modules plus
`drawings`, `pdf` and `openingschedule`: 244 → 116 kB (exact bytes 243,826 →
115,731), 35 → 18 files. The wall sheathing box (`#sheath`) is unticked by
default and every `sheathe()` call sits behind it, so `sheathing.mjs` went the
same way: **244 → 100 kB** (100,327 bytes), 35 → 17 files.

Throttled load: local static server with gzip, Chromium, 150 ms RTT, 1.6
Mbit/s down, CPU 4x slower, service workers blocked, `cache-control:
no-store`; time from navigation to `load`; 7 runs, median. Same conditions as
the babysitting and XER passes.

## Change

`index.html`:

- 14 plan-section modules (sheathing, floor, roof, foundation, drywall,
  insulation, trim, siding, eaves, gutters, dormer, deck, stairs, fasteners) moved out of
  the static imports. Their names are `let` bindings filled by a
  `SECTION_BIND` row when `SECTION_IMPORT`'s `import()` resolves, so the rest
  of the page's code is unchanged.
- `run()` asks `needSections(plan)` right after the stepped walls expand. When
  a section the plan uses is not loaded, it starts the load (one shared
  promise per module, one pending rerun), returns `false`, and runs again
  when the modules arrive. A plan with a floor or a deck stair also loads
  `stairs` (`linkStairReaction`, the deck's own stair); a ticked `#sheath`
  loads `sheathing`. A failed fetch writes
  one line in `#errors` and clears that module's memo, so the next run
  retries.
- The drawing set (HTML and PDF) and the door/window schedule CSV import
  `drawings.mjs`, `pdf.mjs` and `openingschedule.mjs` on the button press,
  through `lib()`, which reports a failed fetch in `#status`.

Kept static, on purpose: `budget`, `schedule` (cards drawn for every plan),
`bidpackage` and `bidletter` (the bid package opens a window, and a
`window.open` after an `await` can be blocked), `dxf` (`sketch.mjs` imports
it), `panels` (the panel-size check runs synchronously).

The page reruns on every input (`later(run)`), so a section is fetched the
moment it is ticked or a plan file with it is opened, well before a download
button is pressed. The one case where a press can be lost: a stored plan with
sections, restored on load, and a download pressed within the first fetch
(about 100 to 800 ms). The button does nothing that once; the next press works.

## Verification

- **Same answers.** A Playwright script (fixed `Math.random`) loaded the old
  page (a copy of `HEAD`'s directory) and the new one, snapshotted every card's
  `innerHTML` and `#errors`, opened a plan file with all 13 sections (built
  from each module's `sample*()` plus empty option objects and a 96 in
  dormer), ticked sheathing (the lazy sheathing path), ran the takeoff, pressed all six download
  buttons (takeoff CSV, drawings HTML, drawings PDF, door/window CSV, budget
  CSV, plan JSON), then reopened in a fresh context from the stored plan. All
  snapshots and all six downloaded files were byte-identical (31 cards
  visible at the end, no page errors). Ticking each section box with blank
  sizes also gave identical panels and errors.
- **Failure path.** With `roof.mjs` answering 503 and a full stored plan, the
  page showed "Part of the takeoff could not load (Failed to fetch dynamically
  imported module: .../roof.mjs). Check the connection and run the takeoff
  again."; after the server recovered, Run takeoff drew the roof card and
  cleared the message.
- **Tests.** `page.test.mjs`: the static-import list is updated, the
  door/window test matches the on-demand handler, and a new test checks the
  two tables have the same 14 keys, every declared name is bound by exactly
  one row and exported by its module, `needSections` asks for every key, no
  section module is imported statically, `run()` checks before any call, a
  failed fetch clears the memo, and the three download-only modules export
  what the handlers call. `python3 platform/ci/run_venture_tests.py
  wall-framing-takeoff`: all pass (one suite, 0 failed), plus the site page checks. The
  venture's browser evals pass with the same counts as before:
  `eval-browser-click` 70 ok, `eval-schedule-click` 33, `eval-sketch-click`
  19, `eval-openings-click` 4.

## After

| | before | after |
|---|---:|---:|
| static graph, gzip | 244 kB (238 kB by `module-weight`) | **100 kB** |
| requests at load, example plan | 36 | **18** |
| throttled time to `load`, example plan (median of 7) | 2,535 ms | **1,705 ms** (−33%) |
| throttled time to results, stored plan with all 13 plan sections | 2,782 ms | **2,464 ms** (−11%) |

Runs, example: before 2457, 2482, 2524, 2535, 2546, 2552, 2590; after 1642,
1699, 1704, 1705, 1705, 1757, 1775. Full stored plan, time until the roof card
and summary are drawn: before 2748, 2752, 2768, 2782, 2883, 2893, 2935; after
2454, 2456, 2462, 2464, 2484, 2496, 2589. The after runs shared the machine
with the venture test suite, so they are if anything pessimistic. The full
plan is not slower even though its sections now arrive after a first,
deferred run: the page's own script parses and runs sooner, and the section
fetches go out in parallel. The harness (`timing.mjs`) and the equivalence
script (`eq.mjs`) were scratch files; their method is described above.

## Not changed, ranked for the next run

1. **changepoint-detector (196 kB)**: `watch-core` and `presteps` (42 kB
   together) still want a `module-exclusive` reading.
2. **xer-schedule-check (201 kB)**: `msproject.mjs` (23 kB) and `mspdi.mjs`
   (17 kB) are import formats; check whether they are only used on file open.
3. Here, `ifcwasm.mjs` (2 kB) and `bidpackage.mjs` (2 kB) are small enough
   to leave.
4. Here, `budget.mjs` (14 kB) and `schedule.mjs` (10 kB) draw cards for every
   plan; they would need the cards to render after a fetch, which a first
   visit would see.
5. P063 and P064 remain owner-gated (workflow files).
