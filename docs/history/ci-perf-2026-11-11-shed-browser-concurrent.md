# Shed Designer browser tests: four at a time, 159 s to 75 s (2026-11-11)

Perf-track run. Both open perf backlog items (P063, P064) edit `.github/` and wait
for the owner, so this run took item 3 of the perf prompt: the slowest local step
an agent session waits on.

## Reading

Whole suites of the most-touched ventures (`git log --since=5.days`), `node --test`
from the venture's directory on the 4-core cloud container, Node v22.23.4, wall time:

| venture | tests | wall |
|---|---|---|
| sales-agent | 487 | 3.0 s |
| einvoice-preflight | 1,447 | 6.8 s |
| clothing-design-studio | 650 | 8.5 s |
| ai-bookkeeper | (306 files) | 53.8 s |
| **shed-designer** | 516 | **218.2 s** |

Each shed-designer file on its own: `browser.test.mjs` 142 s, `gallery.test.mjs`
52 s, `picker.browser.test.mjs` 34 s, `fuzz.test.mjs` 33 s, `designsearch` 21 s,
the rest under 15 s. One file was two thirds of the suite.

## Profile

`time node --test browser.test.mjs`: 144.7 s real, 14.6 s user, 4.9 s sys. `top`
during the run: 45% idle at 30 s, 90% idle at 50 s, load average about 2 on 4
cores. The 43 tests ran one after another, each opening a fresh context and page
and waiting for it to draw (swiftshader WebGL in the GPU process, then the page's
own pricing). No fixed sleeps anywhere: the time is real page work, serialised.

## Change

The 43 tests now sit inside one `describe` with `concurrency:
min(4, availableParallelism())`. Every test already made its own browser context
(own `localStorage`, input and focus; Playwright treats each page as focused), the
static server is stateless, and nothing at module level is written by a test, so
they can share the browser. `SHED_BROWSER_CONCURRENCY=1` restores the old order
if an interaction is ever suspected. The diff is the wrapper plus a re-indent
(`git diff -w`: 12 lines).

## Verification

All with `AXE` set (axe-core 4.13.0, as in `shed-designer-browser.yml`) so the
accessibility test runs instead of skipping:

| run | wall | result |
|---|---|---|
| before (HEAD file) | 159 s | 43 pass |
| after, run 1 to 5 | 74, 74, 72, 75, 74 s | 43 pass, 0 fail each |
| workflow step before: `browser picker.browser gambrel.browser renders` | 160 s | pass |
| workflow step after | 89 s | 65 pass, 0 fail |

Concurrency sweep without AXE (42 tests): 1 = 146 s, 2 = 103 s, 3 = 72 s,
4 = 68 s, 6 = 66 s. Past 4 the CPU is full; 4 is the cap.

Where it lands: the `shed-designer browser tests` workflow job (every PR that
touches `ventures/shed-designer/**`) and every agent session that runs the venture's
suite with Playwright installed (the cloud container has it at
`/opt/node-tools`). In the shared `ventures tests` job Playwright is absent and the
file skips, so that job is unchanged.

## Not changed, ranked

1. `gallery.test.mjs` (52 s): the gallery search again, already worked over three
   times (`ci-perf-2026-11-0[56]-shed-*`); the remaining profile is flat.
2. `picker.browser.test.mjs` (34 s, 11 tests): one test walks every gallery design
   end to end, so concurrency would gain less; worth the same wrapper if measured.
3. `fuzz.test.mjs` (33 s): its size is a deliberate PR-time sample (`FUZZ_N`).
4. P063 and the guard-workflow sparse checkouts: still the largest pool lever, still
   owner-gated.
