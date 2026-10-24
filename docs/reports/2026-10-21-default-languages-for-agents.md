# Default languages: brief for an agent reader

**Date:** 2026-10-21. **Reader:** an LLM agent choosing which programming or
documentation language to write in, or writing a prompt that will make
another agent choose. **Human version:**
[`../posts/2026-10-21-what-language-ai-picks-when-you-dont-say.md`](../posts/2026-10-21-what-language-ai-picks-when-you-dont-say.md).
**Data and code:** [`assets/ai-default-languages/`](assets/ai-default-languages/README.md).

## Answer

When nothing names a language, you (a Claude model) almost always write
Python, switch on your own to SQL, shell, C, Go, Arduino or a single HTML
file when the task signals a reason to, and use Markdown for prose plus the
standard format where one exists (YAML, OpenAPI, JSON Schema, Mermaid).
Those defaults are mostly good. Before you rely on one, check the four
cases where they are wrong: the repository already has a language, the
code is a hot path, the platform needs native code, or the project will
grow and needs types.

## Evidence (verified 2026-10-21, reproducible)

Commands: `python3 analyze.py`, `python3 bench.py` and `python3 census.py`
in `docs/reports/assets/ai-default-languages/`. Outputs: `results.txt`,
`bench.txt` and `census.txt` in the same folder.

- **Setup:** 449 replies (Haiku, Sonnet and Opus via `claude -p` aliases; a
  plain-assistant setup and a coding-agent setup with file tools only; 25
  language-free tasks; 3 repeats; fresh empty folder per call; 1 timeout).
- **Neutral tasks** (7 tasks with no platform or speed hint): Python in
  117/126 replies (93%, Wilson 87-96%). The other 9 wrote no code and asked
  for the missing data. No other language appeared.
- **Switches** (task signal -> language, count):

| Signal in the task | Language | n |
|---|---|---|
| tables | SQL | 17/18 |
| rename files | Shell | 13/18 |
| "fastest" | C or C++ | 17/18 |
| "single executable, no runtime" | Go | 15/17 |
| microcontroller | Arduino C++ or C | 18/18 |
| browser, phone app, game | one HTML file | 51/54 |
| concurrent downloads | Python 13, Shell 4 | 17/18 |

- **Never the main language** in 305 code replies: Rust, TypeScript, Java,
  Kotlin, Swift, C#, Ruby, PHP, R, Julia. The phone app was a web page in
  18/18 replies. 3/449 replies raised the language choice with the user.
- **Documents:** Markdown for README and design docs (36/36), YAML config
  (18/18), OpenAPI YAML (15/18), JSON Schema (18/18), Mermaid diagrams
  (17/18), Markdown with LaTeX math (18/18). Function docs: Python docstring
  11, Markdown page 7. 16/18 assumed the host language was Python.
- **Setup effect:** only the LED task changed its main label between the
  setups (the agent wrote an Arduino `.ino` file).
- **Benchmark** (Sonnet, 3 programs per row, 4 cores; all 37 that ran were
  correct):

| Task | Default | Named language | Speed-up | Code size |
|---|---|---|---|---|
| word counts, 136 MB | Python 5.0-5.7 s | Rust 1.3-1.6 s; Go 2.0-2.1 s | ~4x; ~2.5x | 1.3-2x; 2-3x |
| CSV totals, 200k rows | Python+pandas 0.45-0.50 s | Rust 0.05 s; Go 0.08-0.11 s | ~9x, saving 0.4 s | 3-4x; ~7x |
| primes below 10^9 | C/C++ 0.19-0.35 s | Rust 0.16-0.18 s; Python+NumPy 0.14-2.98 s | ~1.4x; up to 12x slower | similar |

- **This repository** (`census.py`, 16,148 source files, most agent-written):
  research is 91% Python files (807/818 projects mainly Python); products
  are 85% JavaScript because `PRODUCT_PLAYBOOK.md` required build-free
  `.mjs` (rule of 2026-10-16, lifted 2026-10-21). Every other language is forced by the
  domain: Verilog (28 projects), C firmware (4), Kotlin (1), OpenSCAD (2),
  Swift (1). Zero Rust or Go files.

## Inferred (not measured)

- The default follows what most people would pick for a short, self-contained
  answer: little setup, nothing to compile, the largest library ecosystem.
  That is a reason, not a measurement.
- In the agent setup, models inspected the folder before writing. In a real
  repository, existing files and rules probably set the language more
  strongly than the default does. Only the empty-folder case was measured.

## Not checked

- Model families other than Claude. Other prompt wordings or languages.
- Whether a repository with existing Go or Rust code moves the pick.
- Maintenance cost, bug rates or review time per language. The benchmark
  measured only speed, line count and one correctness check.
- One timing run per program on one machine.

## Rules for choosing a language

1. **The repository's language and written rules come first.** Read the
   nearest guide (here: `PRODUCT_PLAYBOOK.md` for `ventures/`, any language
   that fits, plain `.mjs` with `// @ts-check` as the easy path; `research/CLAUDE.md` for `research/`, Python and
   its shared helpers). These are defaults, not mandates (owner,
   2026-10-21: language choice is the builder's judgment); leave them when
   another language makes the work clearly better, and say why.
2. **No rule and no existing code: the default is fine** for scripts, data
   work and algorithms (Python), table queries (SQL), file chores (shell)
   and anything opened in a browser (one HTML file).
3. **Hot path: measure, then switch.** Profile first. Move to Rust or Go
   only when the slow part is CPU-bound code you control, the program runs
   often or on big inputs, and the saving is seconds, not tenths. Check that
   the default was not already a compiled language.
4. **Platform requires it: name it.** Native phone features, app stores or
   widgets mean Swift or Kotlin, not a web page. Firmware means C or C++ for
   a named board. Distribution as one binary means Go or Rust.
5. **The project will grow: add types.** Nothing chose TypeScript unprompted.
   Ask for TypeScript, or `// @ts-check` on JavaScript as this repository
   does.
6. **Documents: name the reader's format.** OpenAPI for APIs, JSON Schema
   for records, YAML for config, Mermaid for diagrams, LaTeX math in
   Markdown are already the defaults. Say whether you want a docstring or a
   reference page, and name the host language, because Python is assumed.
7. **Prompting another agent: put the language in the prompt** whenever
   rules 1, 3, 4 or 5 apply. The other agent will not ask: 3 of 449 replies
   raised the choice.
