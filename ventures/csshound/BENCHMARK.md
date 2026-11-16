# csshound on this repository's venture pages

Measured 2026-11-16 on this repository at commit `321954ed9`, on a 4-core
cloud container (Linux), with csshound 0.1.0 built by
`cargo build --release` (Rust 1.97.0). Time and peak memory come from
[`tests/bench/measure.py`](tests/bench/measure.py), which runs a command and
reads the child's wall time and `ru_maxrss`. File caches were warm.

## Not measured yet: PurgeCSS

The dev-tools direction asks for the original tool's numbers first
(`portfolio/opinions/2026-10-29-dev-tools-in-rust.md`). This run installed
PurgeCSS 9.1.0 from npm and wrote the harness that runs it page by page
([`tests/bench/purgecss_pages.mjs`](tests/bench/purgecss_pages.mjs)), but the
session's permission layer refused to execute the package twice, so there is
**no PurgeCSS time, memory or agreement figure here**. None is estimated.
What stands in for it until a run can measure:

- csshound's decision rules were written from PurgeCSS 9.1.0's source
  (`lib/purgecss.js`: `defaultExtractor`, `shouldKeepSelector`,
  `isAttributeFound`, `evaluateRule`, the ignore annotations), and
  [`tests/rules.rs`](tests/rules.rs) pins each rule with the function it
  comes from.
- `csshound --purgecss` gives PurgeCSS's input (the page's `<style>` blocks
  and linked local stylesheets against the page plus the local scripts it
  loads) and rules, so the comparison is three commands:

```
node tests/bench/purgecss_pages.mjs <dir holding node_modules/purgecss> ventures > purge.jsonl
csshound --purgecss --json ventures > hound.jsonl
python3 tests/bench/compare_rejected.py purge.jsonl hound.jsonl
```

The next run that can execute npm packages should run them and replace this
section with the result, differences and all.

## The input

`ventures/`: 1,379 small products. Of 3,917 HTML files (skipping
`node_modules`, `.git` and `target`), **3,915 carry CSS**: 99,479 style rules
and 8,101,928 bytes of CSS, almost all of it inline `<style>` blocks (only 22
`.css` files exist in the tree).

## Time and memory

| Run | Time | Peak memory |
| --- | --- | --- |
| `csshound ventures` (3 runs, 4 threads) | 0.50 to 0.52 s | 18 to 21 MB |
| `csshound --jobs 1 ventures` (3 runs) | 1.87 to 1.92 s | 14 MB |
| `csshound --purgecss ventures` (3 runs, 4 threads) | 0.28 to 0.30 s | 10 MB |
| `csshound --purgecss --jobs 1 ventures` (3 runs) | 0.92 to 0.95 s | 10 MB |

The default run is slower than `--purgecss` because it follows each page's
module imports and reads every module it reaches, page by page, with no cache
across pages.

## What it found

| Mode | Pages with an unused rule | Unused rules | Unused CSS bytes | Rejected selectors |
| --- | --- | --- | --- | --- |
| `--purgecss` (page + loaded scripts) | 2,008 | 13,412 of 99,479 (13.5%) | 981,425 (12.1%) | 15,601 |
| `--no-dynamic` (+ imported modules) | 1,827 | 8,861 (8.9%) | 646,467 (8.0%) | 11,441 |
| default (+ run-time class prefixes) | 1,820 | 8,815 (8.9%) | 644,192 (8.0%) | 11,383 |

"Unused rule" means every selector of the rule is rejected, so the whole rule
could go; "bytes" counts those rules' own text.

**Following imports removes a third of the findings.** 4,551 rules PurgeCSS's
page input would call unused are used by a module the page's script imports.
`shed-designer/index.html` alone dropped from 104 unused rules (8,558 bytes)
to none: its classes are set by `editor.mjs`, which `app.mjs` imports.

**Run-time prefixes are rare but real.** 46 more rules are kept because the
content builds the name from a prefix: `class="cls-${x.cls}"` in
`restaurant-pos-menu-mix-analyzer` makes `.cls-Plowhorse`, and
`"due tier-" + r.tier` in `eu-ai-act-risk-checker` makes `.tier-prohibited`.
PurgeCSS has no such rule (its documentation asks authors to write class
names out in full); `--no-dynamic` turns it off.

## Spot checks

- 50 randomly drawn single-class findings (seed 11): for 30 the class name
  appears somewhere in a script of the same venture. None of those 30 pages
  loads a script at all (checked for each; examples: `sponsor-ready`'s
  `.score-card`, built in `app.js`, on a checklist page with no script;
  `hearth-and-horizon`'s `.shelf` and `.cover`, used by `stories.mjs`), so the
  rule is dead on that page: a shared stylesheet pasted into pages that do
  not use all of it.
- Most findings are of that kind. The worst venture by bytes,
  `hearth-and-horizon`, carries 180,367 unused bytes across 441 story pages
  that each embed the same full stylesheet.
- What csshound cannot see: class names made from a variable with no
  literal prefix, markup fetched at run time, and classes added by a script
  the page loads from another origin. Treat a finding as "nothing on this
  page or its local scripts names this", not as proof.

## The browser build

`cargo build --release --lib --target wasm32-unknown-unknown
--no-default-features` gives a 97 KB `.wasm`;
[`web/csshound.test.mjs`](web/csshound.test.mjs) checks that it reports the
same as the CLI (`--no-imports`) on 40 real venture pages.
