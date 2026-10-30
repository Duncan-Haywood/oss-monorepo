# Dev tools in Rust, common and niche

*An opinion piece and a candidate list, not a rule. The owner set the
direction on 2026-10-29; the rest is notes from the session that started it.
It narrows nothing in
[`2026-10-20-rust-where-it-is-essential.md`](2026-10-20-rust-where-it-is-essential.md):
the "essential" test still applies, and this piece is about where developer
tools pass it.*

## The owner's view

> I think one cool project direction is common dev tools rewritten in rust.

and, a moment later:

> but also just common and niche tools.

## Notes from the session that started it

**Why dev tools pass the "essential" test more often than calculators do.**
A developer tool runs over a whole repository, often on every commit, and its
users notice seconds. Three of the four reasons in the Rust opinion piece show
up together: the inner loop is our own code (tokenizing, hashing, parsing),
the input is untrusted (whatever is in the repository), and one engine can be
a CLI, a CI gate and a browser page through WebAssembly.

**The bar for each tool.** Before writing a line:

1. Run the original on real input, preferably this repository (9,000+ `.mjs`
   files, 1.27 M lines in `ventures/` alone), and record time, peak memory
   and output.
2. Name the gap: slow, out of memory, needs a runtime the user lacks, can't
   run in a browser, or doesn't exist at all (niche).
3. Ship the Rust version with the same defaults, and a test that compares
   its output with the original's on the same input. Publish agreement, not
   only speed. A faster tool that finds different things is a different tool.
4. If the measurement says the original was fine, write that up instead.
   ([`docs/posts/2026-10-20-we-almost-rewrote-it-in-rust.md`](../../docs/posts/2026-10-20-we-almost-rewrote-it-in-rust.md)
   is the model.)

**Done: `ventures/clonescan`** (copy-paste detection, jscpd's job). jscpd
4.3.0 ran out of memory on `ventures/`; with a 12 GB heap it took 337 s and
6.2 GB. clonescan took 1.2 s and 500 MB, flagging the same lines to within
about 5%. The same crate runs in the browser as a 195 KB `.wasm`.
[`ventures/clonescan/BENCHMARK.md`](../../ventures/clonescan/BENCHMARK.md).

**Already done well elsewhere; don't redo without a measured gap.** ripgrep
(grep), fd (find), bat (cat), delta (diff pager), tokei (cloc), hyperfine
(benchmarking), ruff (flake8, black, isort), uv (pip), biome and oxc (eslint,
prettier), typos (codespell), lychee (link checking), zizmor (GitHub Actions
security), jaq (jq), sd (sed for the simple cases), just (make as a task
runner).

**Candidates, common.** Each needs step 1 before it is a project; none has
been measured yet.

- *Import-graph and cycle checkers* (madge, dependency-cruiser): JavaScript
  tools that parse every module. On a large monorepo they are slow; a Rust
  version built on oxc's parser is plausible. Check first whether oxc or
  biome already ships the check.
- *yamllint*: Python, run on every YAML file in a repository (this one has
  550 workflow files). Check first for an existing Rust port.
- *License scanners* (licensee, scancode): scancode is thorough and slow.
  askalono is a Rust licence-text matcher already; the gap, if any, is the
  whole-tree scan and report.
- *Dockerfile linting* (hadolint, Haskell): a single binary already; a Rust
  version only earns its place as WASM on a page.

**Candidates, niche.** Usually no fast tool exists at all, which is a better
reason than "the existing one is slow".

- *This repository's own page checks.* `platform/ci/check_*.py` are 28
  separate scripts, many of them a pass over the built site's HTML. If those
  passes show up in the CI profile, one Rust binary that parses each page once
  and runs every check could be a large constant-factor win. Measure the Pages build's check step first
  (`platform/ci/ci_profile.py`).
- *Bank and payment statement parsers* (OFX, QIF, MT940, camt.053): the
  `ai-bookkeeper` flagship and several converters parse these from uploads.
  Untrusted input in a parser that must not fall over is one of the four
  "essential" reasons; a fuzzed Rust crate behind the JavaScript readers is a
  real candidate.
- *IFC and STEP readers* for `wall-framing-takeoff`: large text files, our own
  parser, and a browser surface.
- *A duplicate-code consolidator.* clonescan found a copied block in every one of
  the 1,283 ventures that ship a `usage.mjs`, and in all 121 that ship a
  `proposal.test.mjs`. A tool that groups copies into families and proposes the shared
  module is the next step beyond detection, and nobody ships one.

**Distribution.** `cargo install` from crates.io is the natural channel, and
publishing there under the portfolio's name is the owner's decision
(`portfolio/ledger/asks.yaml`, `publication-identity`). Until then each tool
ships as a browser page (WASM) and an install-from-source line.
