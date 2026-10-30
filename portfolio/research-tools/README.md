# Research algorithms as free tools

Graduate- and research-level algorithms from published papers, implemented
as tools that run on the user's own data, in the browser, from the command
line or from an AI agent, with the paper credited on every surface. Where a
tool runs is the agent's call for the method (owner, 2026-10-30; `goals.md`,
"Direction: every platform"): the browser is a good default, not a rule.

Why (owner, 2026-10-20): "i want to move more into in browser ml run tools
that are actually useful [...] let's either give people access to advanced
graduate level plus algorithms or ml applications drawn from real data.
abiding by licenses obviously. [...] looking at open papers and pulling those
from wide domains and implementing them as publically available tools
obviosuly giving credit and citing it." The full quote is in
[`prompts/goals.md`](../../prompts/goals.md), "Direction: research algorithms
as tools".

## What qualifies

- **A method from a paper**, peer-reviewed or on arXiv, beyond what an
  undergraduate course or a spreadsheet gives you (changepoint posteriors,
  conformal guarantees, matrix profiles, optimal transport, survival models,
  causal estimators, ...). Any field.
- **A job a practitioner has, on their own data.** "Did this series shift,
  and when?" beats "a demo of algorithm X". Each tool takes a pasted or
  uploaded CSV, ships a real public dataset as its example, and answers in
  words as well as numbers.
- **Free to run, for us.** No per-call cost on the owner's accounts. Pure
  JavaScript or WebAssembly in the tab is the easy path and gets the Pages
  site, the extension and the app packagers for free. When a method is
  better as a Python package, a CLI, a GPU job or a service the user runs,
  ship it that way. Small ML models are fine when their weights are openly
  licensed.

## Licences and credit

- Implement from the paper's mathematics. Algorithms are not copyrightable;
  code is. Port code only when its licence is MIT, BSD or Apache-2.0, and
  keep its notice beside the port. Never port GPL, AGPL or "research use
  only" code into this MIT tree.
- If a method is known to be patented, say so in the README and skip it
  unless the patent has expired.
- Example data must be public domain or under an open licence that allows
  redistribution (CC0, CC BY, ODbL, US-government works). Record source,
  licence and retrieval date in `data/SOURCE.md`, and cite it on the page.
- Every tool cites its papers in four places: the engine's exported
  `PAPERS` constant (which `platform/agents/tools.mjs describe` prints), the
  page (a "Method and citation" section with BibTeX), the CLI's `--help`, and
  the README.

## What a tool ships (definition of done)

| File | What it holds |
| --- | --- |
| `engine.mjs` (or the engine in the language that fits) | Pure functions, no DOM, no hidden network calls, seeded randomness only. Exports `PAPERS` (`[{ authors, title, venue, year, url, doi?, implemented, deviations }]`), `DEFAULTS`, and a top-level `analyze(input)` that returns a JSON-serialisable result with a plain-language `summary`. |
| `cli.mjs` | Zero-dependency CLI: CSV file or stdin in, human text or `--json` out, `--help` with the citation. This makes the tool eligible for the npm, Homebrew, container and MCP packagers in `platform/distribution/`. |
| `index.html` | CSV paste/upload, "Load example" with the real dataset, an inline-SVG chart, the result in words, "Method and citation" with BibTeX, limits, FAQ JSON-LD, disclaimer, usage counters (`usage.mjs`). If it runs in the page, nothing is uploaded; if the tool is not a browser tool, this is its home/marketing page with install and usage instead. |
| `data/` | The example dataset and `SOURCE.md` (source URL, licence, retrieval date). |
| `README.md`, `VENTURE.yaml`, `LICENSE` | As for any venture; the README opens with what the tool answers, in a searcher's words, links the live page, and has a "Verification" section. |
| `*.test.mjs` | Tests against a **published or independently computed reference** (the paper's own example, a textbook result, or another implementation's output with its provenance), plus property tests (invariances, edge cases), plus `page.test.mjs`. |

Agents get each tool for free: `node platform/agents/tools.mjs search
changepoint`, `describe <slug>` (prints `PAPERS`), `call <slug> analyze
--input '{...}'`, and the same through the MCP server. The page is eligible
for the browser-extension, iOS and Android packagers.

## Tools

| Tool | Papers | Answers |
| --- | --- | --- |
| [`changepoint-detector`](../../ventures/changepoint-detector/) | Adams & MacKay 2007; Killick, Fearnhead & Eckley 2012 | Did this series change level or volatility, when, and how sure? |
| [`conformal-prediction-intervals`](../../ventures/conformal-prediction-intervals/) | Lei et al. 2018; Romano, Patterson & Candès 2019 | How wide must a prediction interval be to cover 90% of new cases, with no distributional assumption? |
| [`matrix-profile-explorer`](../../ventures/matrix-profile-explorer/) | Yeh et al. 2016; Zhu et al. 2016 | Which stretch of this series repeats (motif), and which is unlike anything else (discord)? |

The site files them under "Research algorithms & ML"
(`platform/pages/build.mjs`, `research-algorithms`). Add a row here and the
slug there when a tool lands.

## Candidates

Next papers to implement, each a job someone has: synthetic control (Abadie,
Diamond & Hainmueller 2010) for "did my intervention work"; Kaplan-Meier with
log-rank and Cox (1972) for churn and time-to-event; Sinkhorn optimal
transport (Cuturi 2013) for comparing distributions; Gaussian-process
regression with marginal-likelihood fitting (Rasmussen & Williams 2006);
isolation forest (Liu, Ting & Zhou 2008); robust PCA by principal component
pursuit (Candès et al. 2011); STL decomposition (Cleveland et al. 1990);
Benjamini-Hochberg and e-value multiple testing (1995; Vovk & Wang 2021).
