# Sales Agent: the model client and the mail-file reader load when first used (2026-11-25)

Perf track, version 0, item 4 ("what visitors wait on"). Both open perf
backlog items (P063, P064) touch workflow files in `.github/CODEOWNERS` and
wait for the owner. Sales Agent is a paid product in
`portfolio/monetization/models.yaml` (stage `planned`) and had no page-load
pass.

This run first made the same lazy-importer change to shift-roster-builder,
then found PR #18712 had landed it a day earlier: the session's clone of
`main` was stale and GitHub answered 503 for the first part of the run, so the
duplicate search could not run until after the work. That copy was dropped,
not merged. Lesson for the next run: when `git fetch` fails, check
`docs/history/` on the freshest `main` you can reach before measuring.

## Reading (before)

`node platform/perf/module-weight.mjs .` on `3c6bdae52`: sales-agent
**134 kB gzip over 16 files**, tenth in the repo and the largest page with no
earlier pass. `module-exclusive.mjs ventures/sales-agent/index.html`:

| import | gzip only it pulls in | used |
|---|---:|---|
| `ai.mjs` (+ `byok.mjs`) | 9 kB | only when a model provider is chosen ("bring your own key") |
| `mailfile.mjs` (+ `mime.mjs`) | 9 kB | only when a mail file is picked or dropped |
| `daily.mjs` | 7 kB | the daily queue card, rendered on load: kept |
| `followup.mjs`, `voice.mjs`, `usage.mjs` | 1 to 2 kB each | kept |

`engine.mjs` (46 kB) and `model.mjs` (31 kB) run the built-in rules every
visitor uses.

Throttled load: a local static server with gzip and `cache-control: no-store`,
the build's own `addModulePreloads` applied to both copies (as the Pages build
does), Chromium, 150 ms RTT, 1.6 Mbit/s down, CPU 4x slower, service workers
blocked, external hosts aborted; navigation `loadEventStart`; 7 runs each,
before and after interleaved, median. Same conditions as the babysitting, XER,
wall-framing and shift-roster passes.

## Change (`ventures/sales-agent/index.html` only)

- The two static imports are gone. `onDemand(load)` (the same helper the
  shift-roster page uses) keeps one shared promise per module and forgets a
  failed one, so the next try fetches again.
- `run()` (already async) loads `ai.mjs` only when a provider is set. If that
  fetch fails, the built-in rules read the replies and the status line says
  the model client could not be loaded.
- `readMail()` (already async) loads `mailfile.mjs` before it reads the file;
  a failed fetch writes one line in `#mail-status`.

## Verification

- **Same answers.** A Playwright script opens a three-message mbox (one of
  them the user's own) and then runs the inbox with a model provider set, whose
  endpoint answers 500, on the before and after pages: `#mail-status`,
  `#replies` and `#status` are identical, both called the model endpoint twice
  and fell back per reply, no page errors.
- **Failure paths.** With `ai.mjs` and `mailfile.mjs` answering 404, the mail
  pick shows its one line and the inbox run falls back to the rules with the
  note; with them restored, the same pick reads the file.
- **New test** `page-lazy-modules.test.mjs`: neither module (nor `byok.mjs`,
  `mime.mjs`) is a static import, both load through `import()`, and the names
  the page takes from them are exported.
- `python3 platform/ci/run_venture_tests.py sales-agent`: see the run record's
  `notes`.

## After

| | before | after |
|---|---:|---:|
| module graph on first load (gzip) | 134 kB, 16 files | **116 kB, 12 files** |
| modulepreload links the build adds (whole folder, 4 pages) | 31 | 27 |
| throttled time to `load`, median of 7 | 1,178 ms | **1,021 ms (−13%)** |

All runs: before 1179 1178 1174 1149 1171 1190 1194; after 1019 1022 1041
1018 1016 1021 1026.

## Not changed, ranked for the next run

1. **`engine.mjs` (46 kB) and `model.mjs` (31 kB gzip)** are two thirds of what
   is left. The rules read every pasted reply, so they are needed, but
   `model.mjs` is a learned classifier table, needed only once replies are
   read. Whether the page could fetch it on the first run instead of on load
   was not checked this run.
2. **`daily.mjs` (7 kB)** draws the daily queue on load; it could wait for the
   card to scroll into view, but that changes when the card appears.
3. **shift-roster-builder's `calc.mjs` (117 kB gzip)**, ranked first in
   `shift-roster-page-perf-2026-11-24.md`, is still the largest single module
   on a paid product's page.
