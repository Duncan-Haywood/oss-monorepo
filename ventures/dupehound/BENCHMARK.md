# dupehound vs jscpd: benchmark

Measured 2026-10-29 in a 4-core, 15 GB cloud container (Linux 6.18), on the
`.mjs` files under this repository's `ventures/` directory at commit
`65032126`. Every number below is from one of the commands in this file; the
scripts are in [`tests/bench/`](tests/bench/).

## Setup

- **jscpd 4.3.0** on Node 22.22.0, installed with `npm i jscpd@4`, run with
  its defaults (min 50 tokens, min 5 lines, max 100 KB, max 1,000 lines,
  `mild` mode):
  `jscpd --silent --pattern "**/*.mjs" --ignore "**/node_modules/**" --reporters json --output OUT <dirs>`
- **dupehound 0.1.0**, `cargo build --release` (Rust 1.97, thin LTO), with the
  same limits as its defaults: `dupehound --ext mjs --json <dirs>`
- **Time and memory**: `python3 tests/bench/rss.py <command>` (wall clock, and peak
  RSS of the child from `getrusage`). The jscpd runs were timed with a
  `/proc` polling loop instead (0.2 s samples); peak memory for a run that long
  is not affected by the sampling interval.
- **Agreement**: `python3 tests/bench/compare.py jscpd-report.json dupehound.json`.
- **WebAssembly**: `node tests/bench/wasm_bench.mjs <crate dir> <list of venture dirs>`
  loads `web/dupehound.wasm` in Node (one thread, which is what a browser tab
  gets) with the same file filters.

## Subset: 132 ventures (every tenth directory), 1,054 files, 142,572 lines

| Tool | Wall time | Peak memory | Clones | Duplicated lines |
|---|---|---|---|---|
| jscpd 4.3.0 | 40.1 s | 927 MB | 1,367 | 31.9% |
| dupehound, native, 4 threads | 0.14 s | 58 MB | 2,421 | 32.7% |
| dupehound, WebAssembly, 1 thread | 0.23 s | not measured | 2,421 | 32.7% |

## Whole tree: 9,458 files, 1.27 million lines

| Tool | Wall time | Peak memory | Clones | Duplicated lines |
|---|---|---|---|---|
| jscpd 4.3.0, default Node heap | crashed after 277 s ("JavaScript heap out of memory") at 2.4 GB | | | |
| jscpd 4.3.0, `--max-old-space-size=12000` | 337 s | 6.2 GB | 15,058 | 39.7% |
| dupehound, native, 4 threads (3 runs) | 1.13 to 1.19 s | 500 MB | 36,825 | 40.6% |
| dupehound, native, 1 thread | 3.3 s | 493 MB | 36,825 | 40.6% |

## Do they find the same thing?

Clone *counts* differ by design and should not be compared directly. When a
block exists in N files, each tool reports N-1 pairs, but each picks a
different earlier copy as the partner, and dupehound pairs every copy with
the first in path order. So the comparison that means something is by line:
mark every line inside either side of any clone, for each tool.

| | Subset | Whole tree |
|---|---|---|
| Lines jscpd flags | 54,758 | 580,055 |
| Lines dupehound flags | 54,120 | 568,378 |
| Flagged by both | 51,197 | 542,860 |
| Share of jscpd's lines dupehound also flags | 93.5% | 93.6% |
| Share of dupehound's lines jscpd also flags | 94.6% | 95.5% |
| Files with any clone: jscpd / dupehound / both | 743 / 760 / 739 | 7,328 / 7,469 / 7,268 |

The remaining 5 to 6% is tokenization. jscpd uses a Prism grammar and splits
template literals and some strings into several tokens (16.9 M tokens on the
whole tree against dupehound's 11.7 M), so a 50-token window covers less code
in jscpd and some short clones fall either side of the threshold differently.
dupehound's lexer is generic: one token per string or template literal.

## What this does and does not show

- It is one repository, one language and one machine. The `ventures/` tree is
  unusually repetitive (40% of lines are in a copy), which makes the detector's
  matching stage work harder than in typical code.
- The speed gap is not the language alone. jscpd keeps every token object and
  its source map in a JavaScript heap; dupehound keeps 16 bytes a token and 16
  a window, sorts them, and throws the windows away. A careful JavaScript
  rewrite with typed arrays would close part of the gap; it would not run in
  parallel, and it would not give a CLI and a browser build from one source.
- The correctness evidence is `tests/detect.rs`: a brute-force cross-check on
  random inputs (every window that has an earlier copy is covered by a
  reported clone, and every reported clone's tokens really are equal), plus
  `web/dupehound.test.mjs`, which requires the WebAssembly build to return
  exactly the native CLI's JSON.

## Normalised mode (2026-10-29)

`dupehound --normalize --ext mjs ventures` on the same 9,461 files
(1.27 million lines): 129,081 clones, 60.41% of lines duplicated, 1.65 s,
against 36,830 clones and 40.55% without it (2.77 s in that run). jscpd has no
equivalent mode, so there is no second tool to compare with, and no one has
labelled these matches: the extra 20 points are matches of shape, not
confirmed duplication.

## Families (2026-11-12)

`--families` groups the pairwise clones into families (see the README). Run
on commit `afb29ed4f`, 4-core cloud container, `dupehound --ext mjs --json
[--families] ventures/`, three runs each through `tests/bench/rss.py`:

| Mode | Wall time | Peak memory |
|---|---|---|
| `--json` | 1.22, 1.09, 1.26 s | 576, 572, 573 MB |
| `--json --families` | 1.22, 1.27, 1.14 s | 575, 575, 574 MB |

The grouping costs nothing measurable at this size. What it found: 11,023
files, 1,439,855 lines, 39,263 clones, 553,342 duplicated lines (38.43%),
which fold into **3,214 families** (12.2 pairs a family). 1,950 families are
a single pair; 224 have ten or more copies and hold 336,924 of the 394,293
lower-estimate removable lines. 2,469 families have every copy in a file of
the same name, most often `calc.mjs` (735 families), `page.test.mjs` (414)
and `calc.test.mjs` (406). 2,252 families are wholly token-identical.

The largest five, by lower-estimate removable lines:

| Copies | Identical | Lines | Removable (low to high) | Same file name | Example |
|---|---|---|---|---|---|
| 1,025 | 1,006 | 10 to 76 | 76,380 to 77,060 | `usage.mjs` | `1099-vendor-csv-checker/usage.mjs:5-80` |
| 123 | 121 | 16 to 482 | 57,840 to 57,872 | no | `appliance-repair-quote-calculator/proposal.test.mjs:1-482` |
| 124 | 121 | 12 to 457 | 54,840 to 54,878 | no | `appliance-repair-quote-calculator/proposal.mjs:36-492` |
| 137 | 37 | 7 to 498 | 16,704 to 33,888 | no | `artificial-turf-bid-calculator/share.test.mjs:1-464` |
| 180 | 180 | 82 | 14,678 | `usage.test.mjs` | `1099k-reconciliation-worksheet/usage.test.mjs:24-105` |

The removable figures say what a shared module could save, not that it
should exist. Here the top families are deliberate: each venture is published
as its own directory, so it cannot import across the tree, and the copies
are vendored. `proposal.mjs` is held to its source by
`platform/proposal/sync.test.mjs` and `usage.mjs` by
`platform/ci/usage_contract.mjs`. That is why "guarded" is the next column
the report wants.

