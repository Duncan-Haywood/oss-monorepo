# cyclehound: find circular imports in JavaScript and TypeScript, fast

An import-graph and circular-dependency checker written in Rust, with the same
engine compiled to WebAssembly for a browser page that uploads nothing. It
does madge's `--circular` job: on this repository's 11,422 `.mjs` files it
built the same graph as madge 8.0.0, edge for edge, in 0.2 s and 20 MB
instead of 14 to 18 s and about 350 MB ([`BENCHMARK.md`](BENCHMARK.md)).

**Live page:** https://marisstella.app/cyclehound/

The second tool in the repository's "dev tools in Rust" direction
([`prompts/goals.md`](../../prompts/goals.md), "Direction: dev tools in Rust,
common and niche"), after [`dupehound`](../dupehound/). The candidate came
from [`portfolio/opinions/2026-10-29-dev-tools-in-rust.md`](../../portfolio/opinions/2026-10-29-dev-tools-in-rust.md)
("Import-graph and cycle checkers").

## Why Rust here

- **Inner loop.** A cycle check runs over every file on every commit. madge
  and dependency-cruiser parse each file into a full syntax tree in Node; the
  check only needs the import statements. cyclehound lexes for them in
  parallel: 54 to 94 times faster than madge on the same `.mjs` files and
  about 240 times faster than dependency-cruiser on every module type, in
  under a tenth of madge's memory.
- **Untrusted input.** Whatever is in the repository: the lexer never fails on
  a file, it only finds fewer imports in one it cannot make sense of.
- **One core, every surface.** The CLI and the page run the same code;
  `web/cyclehound.test.mjs` requires the WebAssembly build's report to equal
  the CLI's on the same folders.

## Quickstart (CLI)

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/duncan-haywood/oss-monorepo
cd oss-monorepo && git sparse-checkout set ventures/cyclehound
cargo install --path ventures/cyclehound

cyclehound src/                          # every circular import; exit 1 if any (CI gate)
cyclehound --no-type --no-dynamic src/   # only loops that run when the files load
cyclehound --json src/ > cycles.json     # components, cycles, edges with line numbers
cyclehound --graph --json src/           # whole graph, madge --json shape
cyclehound --unresolved src/             # relative imports that point at no file
cyclehound --orphans src/                # files nothing imports
```

Options: `--ext a,b,c` (default `js,mjs,cjs,jsx,ts,mts,cts,tsx`),
`--no-type`, `--no-dynamic`, `--no-require`, `--no-follow` (stay inside the
given paths), `--ignore-dir NAME`, `--no-gitignore`, `--base DIR`, `--warn`
(report but exit 0). It respects `.gitignore` and always skips
`node_modules`, `.git` and `target`.

Text output names the line of each import on a loop:

```
Component 4 (4 files):
  4) ai-bookkeeper/cashbasis.mjs > ai-bookkeeper/engine.mjs > ai-bookkeeper/cashbasis.mjs
     via ai-bookkeeper/cashbasis.mjs:16, ai-bookkeeper/engine.mjs:24
```

## How it works

1. **Lex** each file (in parallel with rayon): comments, strings, template
   literals with nested `${}`, and regex literals are skipped (a `/` starts a
   regex only where an expression can start, and a regex never spans a line,
   so a misjudged division cannot swallow the file). The token stream is
   matched for `import ... from "x"`, `import "x"`, `export ... from "x"`,
   `import("x")` and `require("x")`; `import type` and `export type` are
   tagged so `--no-type` can drop them.
2. **Resolve** relative specifiers: the exact file, each extension, a
   TypeScript `./x.js` that means `x.ts`, then `index.<ext>`. Package names
   are left out. Files reached outside the given folder are read too (madge
   does the same), unless `--no-follow`.
3. **Tarjan's algorithm** (iterative, so a 200,000-file ring does not
   overflow the stack) finds strongly connected components; a component of
   two or more files, or a file that imports itself, holds a cycle.
4. **List** a shortest cycle (breadth-first, inside the component) through
   each file, duplicates removed.

## Limits

- No path aliases yet (`tsconfig.json` `paths`, webpack `resolve.alias`):
  `@/lib/x` is treated as a package. On this repository that leaves 360
  alias imports in a few Next.js apps unchecked. The next slice.
- No `package.json` `exports`/`imports` maps, and no workspace packages: an
  import of a sibling package by name is not followed.
- A lexer, not a parser: JSX text containing a quote on the same line as an
  import could hide that import. The edge-for-edge match with madge on
  11,422 files is the evidence it holds up on real code.
- Text and JSON output only; no graph drawings (madge draws them).

## Browser build

[`web/cyclehound.wasm`](web/cyclehound.wasm) (249 KB, plain C ABI, no
wasm-bindgen) with [`web/cyclehound.mjs`](web/cyclehound.mjs) as the loader.
Rebuild it after changing `src/`:

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown --no-default-features
cp target/wasm32-unknown-unknown/release/cyclehound.wasm web/
```

## Tests

```sh
cargo test --release                      # lexer, resolver, components, cycles (13 tests)
cargo clippy --release --all-targets -- -D warnings
node --test web/cyclehound.test.mjs page.test.mjs usage.test.mjs
```

`web/cyclehound.test.mjs` compares the WebAssembly report with the native
CLI's on fixture and real folders (it skips that part if the binary is not
built).

## Verification

2026-11-13, first version: 13 Rust tests and 15 Node tests pass;
`cargo clippy -D warnings` and `cargo fmt --check` are clean; the page was
loaded in Chromium (Playwright, 390 px wide): the example finds its
three-file loop and the dynamic self-import, unticking `import()` drops the
latter, no console errors, no horizontal scroll. Benchmarks and graph
agreement: [`BENCHMARK.md`](BENCHMARK.md).

## Licence

MIT. madge, dependency-cruiser and eslint-plugin-import are their authors'
projects; cyclehound reimplements the idea (an import graph and its cycles)
from their public behaviour and shares no code with them, and is not
affiliated with or endorsed by any of them.
