# How deep the ventures are, and how they reach agents

**Date:** 2026-10-20. **Asked by:** the owner, who argued in
[`portfolio/opinions/2026-10-20-build-what-an-agent-would-rather-call.md`](../../portfolio/opinions/2026-10-20-build-what-an-agent-would-rather-call.md)
that light tools lose to an AI agent that just does the job itself, and that
the portfolio should move toward hard, work-intensive problems, each one
distributed through many surfaces (package, CLI, MCP, TUI, web app, docs).
This report puts numbers on both halves of that argument: how deep the
ventures are, and how many ways each one can be reached.

**Method:** read-only. A script,
[`assets/depth-audit/depth_audit.mjs`](assets/depth-audit/depth_audit.mjs),
walks all 1,304 folders in `ventures/` and writes
[`assets/depth-audit/summary-2026-10-20.json`](assets/depth-audit/summary-2026-10-20.json).
Rerun it with `node docs/reports/assets/depth-audit/depth_audit.mjs`. Every
measure is a proxy, and the "What these numbers miss" section says what each
one misses.

## The short version

- **Seven in ten ventures are light.** The median venture has **350 lines**
  of non-test source code. **925 (71%) have under 500**, and only **16 have
  3,000 or more**.
- **The light tools are reached the most ways; the deep ones the fewest.**
  1,264 ventures, nearly all of them light, can be called by an agent
  through `platform/agents/tools.mjs` (CLI and MCP). But **10 of the 20
  largest ventures can't be**, including two flagships (photo-editing and
  quick-pick-survey). The repo's distribution is set up for the kind of
  tool an agent is most likely to redo itself.
- **No venture is a published package.** No `ventures/*/package.json` is
  publishable to npm (none has a name and no `"private": true`). 9 ventures
  have a `pyproject.toml`, but that isn't packaging: photo-editing's says
  it is lint config only, "not packaged or installed".
- **Few light tools carry outside data an agent would have to look up.**
  876 of the 925 light ventures don't link a single outside source in their
  code. Only 53 ventures link three or more. Cited, dated data is the one
  kind of depth a light tool can have, so this is a rough measure of how
  many light tools would survive an agent redoing them.

## Finding 1: depth

| Non-test source lines | Ventures |
|---|---:|
| under 200 | 151 |
| 200–499 | 774 |
| 500–2,999 | 363 |
| 3,000 or more | 16 |

The 20 largest, with test files, outside links in the code, and surfaces
found (out of six: web, CLI, agent catalogue, npm, `pyproject.toml`, server):

| Venture | Lines | Test files | Outside links | Surfaces |
|---|---:|---:|---:|---:|
| local-site-studio | 97,354 | 242 | 30 | 1 |
| photo-editing *(flagship)* | 31,614 | 34 | 2 | 2 |
| print-atelier | 19,479 | 40 | 12 | 1 |
| quick-pick-survey *(flagship)* | 10,856 | 42 | 1 | 1 |
| einvoice-preflight *(flagship)* | 9,181 | 67 | 2 | 5 |
| retail-pilot-intel | 8,615 | 10 | 5 | 1 |
| real-estate-agent-photo-app | 8,174 | 14 | 24 | 1 |
| sales-export-to-journal | 6,512 | 3 | 0 | 2 |
| ebay-fee-calculator | 5,617 | 29 | 0 | 2 |
| amazon-fba-calculator | 4,407 | 18 | 0 | 3 |
| workflow-audit | 4,284 | 2 | 0 | 1 |
| shopify-fee-calculator | 3,699 | 24 | 0 | 3 |
| ai-first-markets | 3,505 | 6 | 4 | 1 |
| open-tennis-robots *(flagship)* | 3,362 | 7 | 4 | 3 |
| league-schedule-generator *(flagship)* | 3,265 | 5 | 1 | 3 |
| ai-engineering-academy | 3,070 | 22 | 0 | 0 |
| reseller-books | 2,898 | 3 | 0 | 2 |
| shift-roster-builder *(flagship)* | 2,478 | 6 | 1 | 4 |
| where-to-sell-calculator | 2,401 | 17 | 0 | 4 |
| photos-import-tools | 2,390 | 5 | 0 | 2 |

Size isn't depth. `portfolio/flagships.yaml` already calls local-site-studio
bloated and says several others are mostly plans and demo UI. And
shift-roster-builder, the hardest algorithmic problem in the list, is one of
the smallest. Size is a ceiling, not a score. What it does show is that
almost the whole portfolio sits below the size where a hard problem could
live at all.

## Finding 2: distribution runs the wrong way round

| Surface | Ventures that have it |
|---|---:|
| web page or deployable app | 1,302 |
| agent catalogue (CLI + MCP via `platform/agents/tools.mjs`) | 1,264 |
| its own CLI (`*cli.mjs`, `*cli.py` or a `bin`) | 172 |
| self-host server (`server.mjs` or `Dockerfile`) | 64 |
| has a `pyproject.toml` (not necessarily a package) | 9 |
| publishable npm package | 0 |

1,051 ventures have exactly two surfaces: their page, and the agent
catalogue entry generated from it. That shared catalogue is the right
pattern: one core, with every surface generated from it. But it only picks
up a venture with an `index.html` and an importable engine module, so the
Next.js apps and Python pipelines (where most of the depth lives) are left
out:

- **Not in the agent catalogue:** local-site-studio, photo-editing,
  print-atelier, quick-pick-survey, retail-pilot-intel,
  real-estate-agent-photo-app, workflow-audit, ai-first-markets,
  ai-engineering-academy, photos-import-tools.
- **Best distributed:** einvoice-preflight, with web page, agent
  catalogue, `pyproject.toml`, server and Dockerfile (5 of 6). It still has
  no package on any registry, and the official Schematron check runs only in Node
  (`flagships.yaml`).

That's the inversion the owner's argument predicts would hurt. An agent can
already call a 200-line fee calculator through MCP, but it can't reach the
31,000-line media pipeline or the Glicko-2 survey ranker at all.

## Finding 3: almost no light tool has data depth

A light tool can still beat an agent redoing it if it holds current, cited
facts the agent would otherwise have to research and might get wrong: tax
thresholds, marketplace fee schedules, filing deadlines. As a proxy, the
audit counts distinct outside URLs in each venture's code. It skips GitHub,
`localhost`, `example.*`, `w3.org` and schema URLs.

- 1,188 of 1,304 ventures link no outside source in their code.
- 876 of the 925 light ventures link none.
- 53 ventures link three or more.

## What these numbers miss

- **Lines** count `*.mjs`, `*.js`, `*.py`, `*.ts`, `*.tsx` and `*.rs`
  files, skipping anything named `*test*`, anything under `tests/`,
  `node_modules`, build output and `*.min.js`. Inline scripts in HTML pages
  aren't counted, so a tool built as a single page reads smaller than it
  is.
- **Outside links** only count URLs in code. A tool that cites its sources
  in the page text, a JSON data file or the README reads as zero. Treat 876
  as an upper bound on light tools with no cited data.
- **Surfaces** are detected from files on disk, not from what's live. The
  CLI check only looks at the venture's top folder, so a CLI under `src/`
  is missed: photo-editing's `src/shootflow/cli.py` is, while
  einvoice-preflight's `generate-cli.mjs` and `schematron-cli.mjs` count. "Web" counts a Next.js app as deployable, whether or not
  anyone has deployed it.
- **Usage** isn't measured here. Most products have never had a usage
  reading (`portfolio/usage/usage.yaml`). Nothing in this report is a
  reason to retire a tool.

## What to do with it (for the next agent)

These are concrete, mergeable slices, highest leverage first. Each one is
sized for one session and has a bar it can miss.

1. **Put the flagships in the agent catalogue.** Make
   `platform/agents/tools.mjs` (or a small manifest it reads) expose a
   venture with no `index.html` engine, e.g. a `VENTURE.yaml` field naming
   a CLI entry point and its JSON contract. Do photo-editing (`shootflow`
   CLI, `PYTHONPATH=src python3 -m shootflow.cli`) and quick-pick-survey's
   ranking engine first. Bar: `node
   platform/agents/tools.mjs describe photo-editing` returns a callable
   entry, with a test in `platform/agents/tools.test.mjs`.
2. **Publish one real package.** einvoice-preflight's validator core as an
   npm package (it has no `package.json` yet; add one with a `bin` for the
   CLI), so `npx` works. Writing the package is agent work. Actually publishing under the
   portfolio's name is an owner action (`CLAUDE.md`, "Flag the owner"), so
   check `python3 portfolio/ledger/decision_queue.py` and ask once if it
   isn't already queued.
3. **Prove optimality on the shift-roster sample week.** Add an LP
   relaxation or min-cost-flow bound to `ventures/shift-roster-builder/calc.mjs`
   `exactSearch`, either through an existing WASM LP solver (HiGHS has a WASM
   build; check its licence, MIT at last check) or a Rust crate compiled to
   WASM. Bar: `--prove` finishes on the 32-shift sample week and the test
   asserts the proven optimum. Then benchmark on public INRC-II
   nurse-rostering instances. This is the flagship's own `next` in
   `portfolio/flagships.yaml`; update that line when you land a slice.
4. **Make the audit a trend.** Rerun `depth_audit.mjs` in a later run and
   commit a new dated summary next to this one. A second reading is what
   turns these counts into a direction.
5. **Default for new venture work:** before building a new light tool, ask
   the opinion piece's question: would a capable agent with a shell get the
   same answer, as reliably, in a few minutes? If yes, put the effort into
   a flagship instead. That's a judgment call, not a gate (`prompts/steering.md`).

Not done in this session, on purpose: no tool was retired, no rule was
added to an always-read file, and nothing was published to a package
registry.
