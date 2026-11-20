# Pages perf, 2026-11-20: the request form's pickers load on demand

Perf track, "what visitors wait on". Both open perf backlog items (P063, P064)
touch only CODEOWNERS paths, so this run measured the built site instead.

## Reading

`node platform/pages/build.mjs --out=<dir>` on `main` (67f98fb2f): 2 m 07 s
wall, 4 m 43 s user, 12,311 HTML pages. A scratch script (not committed) summed,
per page, the gzip size (level 6) of the HTML plus every same-site stylesheet
and script it links: mean 20.8 kB, median 16.8 kB, p95 32.9 kB.

The heaviest pages were research programme pages (long LOGs, 170 to 250 kB
gzip: content), `guides/index.html` (a deliberate full listing), and then
something that should not have been there: **the six custom development pages
at 92 to 102 kB gzip each, 330 to 375 kB raw.** That is the page a business
lands on to ask for free custom software, the venture default
(`portfolio/requests/`).

Inside one request page (343 kB raw): the hidden "Which tool?" `<select>` was
152 kB (1,419 tools) and the hidden "Which research direction?" `<select>`
146 kB (about 1,100 projects). Both sit in `[data-cd-for]` blocks that stay
hidden unless the visitor picks a "feature", "problem" or "research" kind.
Together they were 87% of the page.

## Change (`platform/pages/build.mjs`)

- `renderRequestFormOptions` renders the two `<option>` lists exactly as
  `renderRequestForm` did, and the build writes them once to
  `custom-development/form-options.json` (`REQUEST_OPTIONS_FILE`).
- The form's script fetches that file the first time a kind that shows a
  picker is selected, or at once when the URL carries `?tool=` or `?dir=` (every
  tool footer links `?kind=feature&tool=<slug>`), then applies the same
  preselection the inline version did. `?dir=` still switches the kind to
  research, but only if the visitor has not changed it while the file loaded.
- If the fetch fails, a footer link's tool slug is kept as the one option (so
  the request still names it), otherwise one "the list did not load: I name
  the tool in my message" option lets the form submit.
- Nothing works without script either way: the form has no `action` and
  submits with `fetch`, so no no-script path is lost.

## After

| page | raw before | raw after | gzip before | gzip after |
|---|---:|---:|---:|---:|
| `custom-development/` | 375,850 | 76,102 | 104,484 | 23,027 |
| `custom-development/R-0001/` | 343,444 | 43,699 | 94,434 | 13,067 |
| `form-options.json` (new, fetched on demand, cached across pages) | | 305,548 | | 81,596 |

A visitor who reads the page and never opens a picker kind now downloads 78 to
86% less HTML. One who does pays the same bytes once, then from cache on the
other five pages. Build time is unchanged (1 m 48 s on the rerun; the box is
noisy).

## Verification

- `diff -rq` of the full build, before against after: only the six custom
  development pages, the new JSON file and the two build stamps (`sw.js`,
  `version.json`) differ.
- Playwright against both builds served locally: `?kind=feature&tool=<slug>`,
  `?dir=<slug>` on the index and on a request page, and a plain request page
  give the same checked kind, selected tool and selected direction. After
  ticking "A feature", the tool and direction `<select>`s' `innerHTML` are
  identical to the inline build's (1,419 tools). No page errors.
- `custom-development-page.test.mjs` now pins the lists' content and escaping
  through `renderRequestFormOptions`, that pages no longer inline them, and the
  fetch URL from both depths; the full `platform/pages` suite and `check.mjs`
  ran on the result (see the run record).

## Not changed, ranked for the next run

1. **Research programme pages, 120 to 257 kB gzip** (`marine-hull`,
   `cell-fidelity`, `heavy-hydraulics`): the LOG is rendered in full with a
   fold. Splitting older log entries into a separate page would cut the eager
   weight, but it is the content readers and crawlers came for: needs a reading
   argument, not only a speed one.
2. **`hearth-and-horizon/index.html`, 130 kB gzip HTML**: not yet looked at.
3. **`wall-framing-takeoff/index.html`, 60 kB HTML + 37 kB assets**: flagship
   one's landing page; worth a look at what its inline payload is.
4. `guides/index.html` (182 kB gzip): unchanged reasoning from
   `ci-perf-2026-11-10-pool-and-page-weight-reading.md`.
