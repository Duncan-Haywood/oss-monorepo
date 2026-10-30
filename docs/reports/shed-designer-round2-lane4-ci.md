# shed-designer round 2, lane 4: test and CI infrastructure

Date: 2026-10-30. Built from round 1's handoff reports (lane 2, 3 and 5 "Open" sections).

## What landed

| PR | What |
|---|---|
| #11519 | Browser checks nightly: Playwright 1.56 → 1.63.0 (in `browser-checks-ci.yml`, `platform/uitest/action.yml` and its README, `distribute-shorts.yml`, and the `browser_state.py` hint). One matrix job per check, each with its own 60 min. The harness unit tests run once in a `plan` job. `browser_checks.py` launches Chromium once before the build and exits 2 (skip) if it won't start. `journey.mjs` allows exactly `<counter>/hit` from `platform/counter/site.json`. |
| #11529 | `shed-designer-fuzz.yml`: nightly at 05:47 UTC, `FUZZ_N=2000`, seed = days since 1970, read-only. A red night prints the reproduce command with its seed and uploads `fuzz-failures.json`. |
| #11541 | shift-roster-builder `page.test.mjs` #171 (red on main since 2026-10-29). The call-out page now says 24 of 29, matching the current engine. The test also checks the prose. |
| #11548 | commercial-photo-license-calculator: `license-extension-fee.html` was dead, because importing `app.mjs` threw on the missing `#quote-form`. Found by `optout`. |
| this PR | Shared site nav overflowed 2px on 23 pages with a 14px gutter (`overflow-x:clip` on the venture top chrome). Found by `sideways`. Plus this report and a post. |

## Why the nightly was red (all 50 runs listed, from 2026-09-10)

1. To 2026-10-12: runs died in about 4 s.
2. 2026-10-13 to 10-20: cancelled at 60 min. Eight checks on a 5,400-page site in one job: `sideways` 3 min, `presets` 15, `roundtrip` 25, then `contrast` was cut off.
3. 2026-10-21 to 10-29: Playwright 1.56 cannot install Chromium on Ubuntu 26.04. The install is `continue-on-error`, so all eight checks died with "Executable doesn't exist", reported as "8 of 8 failed". Lane 3's "all 1 browser checks passed" was the harness unit tests' own fixture run, not the real one.

## Dispatched run on #11519 (run 40984578526), per check

- `highlight`: **pass**.
- `optout`: 1 of 1,564 pages forgets → fixed in #11548.
- `sideways`: 23 pages +2px, all the nav bleed → fixed in this PR. The report names the widest box (`a`, inside a scroll container), not the culprit (`span.pfs-nav`). `sideways.mjs` could skip boxes whose ancestor clips or scrolls (left open).
- `journey`: off-origin counter beacon → fixed in #11519. Still open: "the tool page says whether its own quotes have been landing differently" times out on `page.click` (30 s), reproduced locally against a fresh build. This is a saved-bids feature of the bid calculators, not CI.
- `roundtrip`: the runner was shut down after 15 min (exit 143, "runner has received a shutdown signal"), so no verdict. Watch the next nightly.
- `sweep`: 87 of 88 tools answered. `support-agent` is NO-RESPONSE: the check changed 3 fields, filled 1 and pressed 1 button, and the output stayed identical. Open (product).
- `presets`, `contrast`: were still running when this was written. Read the next nightly.

## shed-designer fuzz (lane 5's ask)

- Seed 20756 at N=2000: **1 failure**. A 228×186 design with `lengths: [8]` and a 64" window at 114" on the front wall. The front-wall plate splice check fails: "cap joint at 111-3/4"; cap joint at 192"". It passes without the window, so the bug is in splice placement over a long header with only short boards. Product code, handed to the parent session and product lanes. The nightly stays red until it is fixed. Reproduce: `cd ventures/shed-designer && FUZZ_N=2000 FUZZ_SEED=20756 node --test fuzz.test.mjs`.
- N=2000 takes 112 s on 4 cores.

## Default suite time (shed-designer)

The default suite runs 133 tests in 20 s of wall time on 4 cores (`browser.test.mjs` excluded; it runs in its own workflow). The slowest are the fuzz invariants (6.5 s), the fuzz junk test (3.7 s), the simplicity search (4.7 s) and the budget search (2.4 s). Each is slow because the search is what it tests, so nothing was cut. The wide sweep went to the nightly instead.

## Open, for the next run

- The fuzz seed 20756 splice failure (product).
- The `journey` saved-bids click timeout.
- `support-agent` does not respond to input (`sweep`).
- shift-roster-builder `page.test.mjs` takes about 6.5 min, 155 s of it in the call-out study (61 full roster rebuilds). Caching the base roster or shrinking the study would cut minutes from every PR that touches that venture.
- `sideways.mjs`'s "widest" label should ignore boxes inside a scroll or clip container.
- The browser-checks header still says the repository is private with metered minutes. CLAUDE.md now calls it public. Re-check before changing the trigger.
- Read the first scheduled run of the split workflow (04:20 UTC, 2026-10-31) for `presets`, `contrast` and `sweep` verdicts.
