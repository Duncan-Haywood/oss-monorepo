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
cyclehound --unresolved src/             # relative or alias imports that point at no file
cyclehound --orphans src/                # files nothing imports
cyclehound --unused-exports src/         # exports no file imports; exit 1 if any
cyclehound --deps .                      # package.json deps nobody imports, imports nobody declared
```

Options: `--entries` (with `--unused-exports`, also report the exports of
files nothing imports, which are skipped by default as entry points),
`--ext a,b,c` (default `js,mjs,cjs,jsx,ts,mts,cts,tsx`),
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
2. **Resolve** relative specifiers, and aliases through `tsconfig.json`
   (see "Path aliases" below): the exact file, each extension, a
   TypeScript `./x.js` that means `x.ts`, then `index.<ext>`. Package names
   are left out. Files reached outside the given folder are read too (madge
   does the same), unless `--no-follow`.
3. **Tarjan's algorithm** (iterative, so a 200,000-file ring does not
   overflow the stack) finds strongly connected components; a component of
   two or more files, or a file that imports itself, holds a cycle.
4. **List** a shortest cycle (breadth-first, inside the component) through
   each file, duplicates removed.

## Unused exports

`--unused-exports` does the job of `ts-unused-exports` (or knip's unused
exports check) on the same lexer. On this repository's 11,736 `.mjs` files it
took 0.3 s and 30 MB where ts-unused-exports 11.0.1 took 11 s and 380 MB, and
the two agree on 5,419 findings; every difference is explained in
[`BENCHMARK.md`](BENCHMARK.md). What counts as taking an export:

- `import d, { a, b as c } from "./x"` takes `default`, `a` and `b`;
  `const { a, b: c } = await import("./x")` takes `a` and `b`.
- `import * as ns`, a dynamic import kept whole, and `require()` take every
  export (member reads on the namespace are not followed); `import "./x"`
  takes none.
- `export { a as b } from "./x"` passes a request for `b` on to `a` in x;
  `export * from "./x"` passes on every name the file does not export
  itself (never `default`).
- A name used only inside its own file is still reported: the `export`
  keyword is what is unused.

Files nothing imports are entry points (a page script, a CLI, a test, a
package's public API), so their exports are skipped unless `--entries`.
CommonJS `module.exports` is not read.

## Dependencies (`--deps`)

`--deps` does depcheck's job: for every `package.json` under the given
folders, it lists the `dependencies` and `devDependencies` no file uses and
the packages files import without declaring them, with the file and line of
each use. Each package is checked on its own; a folder with its own
`package.json` belongs to that package, not its parent. It exits 1 when there
is a finding (`--warn` exits 0).

```
ventures/ai-first-markets/package.json
  unused devDependency: @eslint/eslintrc
  unused devDependency: esbuild
ventures/local-site-studio/package.json
  missing: vite (ventures/local-site-studio/tsconfig.json)
```

The rules are depcheck 1.4.7's, read from its source: the same import forms
(`import`, `export ... from`, `import()`, `System.import()`, `require()` with
one argument, `require.resolve()`, `import x = require()`,
`grunt.loadNpmTasks()`), the same package-name rule, Node's built-ins, URL
and webpack `a!b!./c` loader handling, `@types/x` for TypeScript files,
`import type` with only `@types/x` declared, tsconfig `types` and `extends`,
package.json `imports` (`#x`), the React 17 JSX rule, and installed packages'
binaries in scripts and peer dependencies. **`--depcheck`** stops there, and
on 474 packages (this repository's 32 and 442 inside 153 npm tarballs) it
gives depcheck's answer on every package, except for 9 package names whose
only uses sit in the 56 files depcheck's parser rejected (cyclehound's lexer
never rejects a file). It took 0.5 s against 10 s here and 1.9 s against
369 s on the tarballs ([`BENCHMARK.md`](BENCHMARK.md),
"Dependencies").

Without `--depcheck`, a few guesses remove what depcheck gets wrong on a fresh
checkout (on this repository: 81 findings with `--depcheck`, 4 without, each
checked by hand). Each guess but the last can only remove a finding, never add one.

- **Scripts, nothing installed.** depcheck sees a script's command only
  through `node_modules/<pkg>/package.json`, so before `npm install` it calls
  `tsx`, `eslint` and `typescript` unused. cyclehound counts a script word
  equal to the package's name, or a known binary (`tsc` for `typescript`,
  `cap` for `@capacitor/cli`).
- **Config files.** `tsconfig.json` uses `typescript`; `postcss.config.*`
  uses `postcss`, `tailwind.config.*` `tailwindcss`, and so on for 22 tools;
  a string or object key in a `*.config.*` or `*rc*` file that is exactly a
  declared name uses it (`plugins: { autoprefixer: {} }`).
- **Stylesheets and pragmas.** `@import`, `@plugin`, `@use` and `@config` of
  a bare package in `.css`, `.scss`, `.sass`, `.less`; `// @vitest-environment
  jsdom` and `@jest-environment` in test files.
- **Framework peers, nothing installed.** `next` uses `react` and
  `react-dom`; `@testing-library/react` uses `@testing-library/dom`;
  `@types/x` is used whenever `x` is.
- **Not packages.** A tsconfig `paths` alias that lands on a file
  (`@/lib/x`), a scheme (`bun:test`, `virtual:x`, `data:`) and a package
  importing itself by name.
- **Types.** `import("x")` in a TypeScript type (`x: import("y").T`, and
  every `import()` in a `.d.ts`), which depcheck's default detectors skip,
  counts as a use: the types need the package. This is the one default
  that can add a "missing" finding (nock 15.0.6's published types use
  `undici-types` without declaring it).

What it does not do: depcheck's twelve config readers that `require()` the
project's own `webpack.config.js`, `jest.config.js`, `.babelrc.js` and the
like (cyclehound never runs project code, which also makes it safe on code
you did not write); Vue, Svelte, CoffeeScript and GraphQL files; workspace
protocols beyond reading each package.json on its own.

## Path aliases

`import x from "@/lib/x"` goes through the `paths` and `baseUrl` of the
nearest `tsconfig.json` above the importing file (or a `jsconfig.json` in a
directory with no tsconfig), by TypeScript's own rules:

- `extends` (a relative path or an array of them) is followed; each of
  `paths` and `baseUrl` comes whole from the nearest config that sets it.
  Package configs (`"extends": "@tsconfig/node18"`) are not read.
- `paths` targets are relative to `baseUrl`, or with none, to the config
  that sets `paths`. An exact pattern beats a wildcard; among wildcards the
  longest prefix wins; targets are tried in order.
- With `baseUrl` set, a bare specifier no pattern matched is tried as
  `baseUrl/<spec>`; when that is not a file it stays a package.
- Targets in `node_modules` or ending `.d.ts` are package typings and stay
  out of the graph.
- An alias whose pattern matched but no target exists (`@/lib/gone`) is
  listed by `--unresolved`; a `"*"` pattern's miss is taken as a package.

`--no-tsconfig` turns this off. On this repository the 16 tsconfigs in
`ventures/` add 1,436 alias edges (11,560 to 12,996), and TypeScript 5.9.3's
`resolveModuleName` sends the same 1,436 imports to the same files
([`BENCHMARK.md`](BENCHMARK.md), "Path aliases").

## Which cycles break: entry order

A cycle is only a bug when one module reads another's top-level value while
that other module is still loading, and which one is "still loading"
depends on which file the program imports first. A test suite that always
enters from the same file never sees it; a new page or worker that enters
from another one gets `ReferenceError: Cannot access 'X' before
initialization`. [`tools/entry-order.mjs`](tools/entry-order.mjs) takes the
cycles cyclehound finds and loads each `.mjs`/`.js`/`.cjs` file on them first,
in its own Node process:

```sh
cargo build --release
node tools/entry-order.mjs ventures/          # exit 1 on a cycle-order failure
node tools/entry-order.mjs --json ventures/   # every file's result
```

It runs those modules' top-level code, so point it only at code you trust.
Other load errors (a module that needs a browser) are listed but only fail
the run with `--strict`. `tests/fixtures/tdz/` holds a cycle that fails from
one end and one that is safe from both (`tools/entry-order.test.mjs`).

On this repository's `ventures/` (2026-11-19): cyclehound found 11 static
cycles through 34 files in 0.58 s; the 21 product modules on them
(ai-bookkeeper, league-schedule-generator, shed-designer,
babysitting-business-kit and two `platform/pages` files) all load cleanly
whichever one comes first. The three other load errors are the `ring`
fixture's deliberate directory import, and the TypeScript files are not run.
The whole pass takes about 2 s.

## Limits

- No bundler aliases (webpack `resolve.alias`, Vite `resolve.alias`): those
  live in JavaScript config files, not JSON.
- The tsconfig search walks up the paths as given: run from the project root
  or above it (`cyclehound src` finds `./tsconfig.json`; running inside
  `src/` does not look above the working directory).
- No `package.json` `exports`/`imports` maps, and no workspace packages: an
  import of a sibling package by name is not followed.
- A lexer, not a parser: JSX text containing a quote on the same line as an
  import could hide that import. The edge-for-edge match with madge on
  11,422 files is the evidence it holds up on real code.
- Text and JSON output only; no graph drawings (madge draws them).

## Browser build

[`web/cyclehound.wasm`](web/cyclehound.wasm) (274 KB, plain C ABI, no
wasm-bindgen) with [`web/cyclehound.mjs`](web/cyclehound.mjs) as the loader.
Rebuild it after changing `src/`:

```sh
rustup target add wasm32-unknown-unknown
cargo build --release --lib --target wasm32-unknown-unknown --no-default-features
cp target/wasm32-unknown-unknown/release/cyclehound.wasm web/
```

## Tests

```sh
cargo test --release                      # lexer, resolver, aliases, components, cycles, exports, deps (36 tests)
cargo clippy --release --all-targets -- -D warnings
node --test web/cyclehound.test.mjs page.test.mjs usage.test.mjs tools/entry-order.test.mjs
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

2026-11-20, `--deps`: 36 Rust tests and 21 Node tests pass, `cargo clippy
-D warnings` and `cargo fmt --check` clean; `tests/bench/compare_deps.cjs`
agrees with depcheck 1.4.7 on all 474 packages (BENCHMARK.md). The same run
fixed a lexer bug: a keyword used as a property name (`o.else / e`) started a
regex and hid every later import on the line (it hid 22 of 23 `require()`
calls in next's bundled `@vercel/nft`). The graph of `ventures/` and of the
npm corpus is byte-identical before and after the fix.

## Licence

FSL-1.1-MIT. madge, dependency-cruiser and eslint-plugin-import are their authors'
projects; cyclehound reimplements the idea (an import graph and its cycles)
from their public behaviour and shares no code with them, and is not
affiliated with or endorsed by any of them.
