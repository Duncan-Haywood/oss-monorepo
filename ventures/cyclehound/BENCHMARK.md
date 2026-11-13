# cyclehound against madge and dependency-cruiser

Measured 2026-11-13 on this repository at commit `96526641f`, on a 4-core,
15 GB cloud container (Linux), Node v22.23.4. Tools: madge 8.0.0 and
dependency-cruiser 16.10.4 from npm; cyclehound 0.1.0 built with
`cargo build --release` (Rust 1.97). Time and peak memory come from
[`tests/bench/measure.py`](tests/bench/measure.py), which runs a command and
reads the child's wall time and `ru_maxrss`. File caches were warm: every tool
had already read the tree once.

## The input

`ventures/`: 1,300-odd small products, mostly plain ES modules. Reading
`.mjs` only and following imports out of the folder (both tools do), the graph
has **11,422 files and 9,417 imports** between them. With every
JavaScript and TypeScript module type it has 12,695 files.

## Time and memory

| Run | Time | Peak memory |
| --- | --- | --- |
| `madge --circular --extensions mjs ventures` (3 runs) | 14.1 to 17.8 s | 327 to 363 MB |
| `madge --circular --extensions js,mjs,cjs,jsx,ts,mts,cts,tsx ventures` | 19.2 s | 582 MB |
| `depcruise --no-config --output-type json ventures` (every type) | 51.8 s | 2,272 MB |
| `cyclehound --ext mjs ventures` (3 runs) | 0.19 to 0.26 s | 17 to 20 MB |
| `cyclehound ventures` (every type, 3 runs) | 0.20 to 0.22 s | 18 to 23 MB |
| `cyclehound .` (the whole repository, 13,227 files) | 0.25 to 0.34 s | 20 MB |

dependency-cruiser was run for its graph, not with a no-circular rule, so its
time is the cost of building the graph it would check. Both Node tools spend
most of their time parsing with a full JavaScript parser per file; cyclehound
uses a lexer that only needs to recognise import statements (see "Where the
tools differ").

## Agreement: the same graph

The point of a faster tool is nothing if it finds different things, so the
graphs were compared edge by edge with
[`tests/bench/compare_graphs.py`](tests/bench/compare_graphs.py).

**madge.** `madge --extensions mjs --json ventures` against
`cyclehound --graph --json --ext mjs --no-require ventures`:

```
madge: 11422 nodes, 9417 edges; cyclehound: 11422 nodes, 9417 edges
common edges 9417; only madge 0; only cyclehound 0
```

Identical. With `require()` counted (cyclehound's default) cyclehound adds two
edges, both `require()` calls inside `.mjs` test files
(`sponsor-ready/page.test.mjs` and `einvoice-preflight/mandate-countdown.test.mjs`,
which build a `require` with `createRequire`). madge reads an ES module with
its ES-module detector only, which does not look for `require`. Those edges
are real at run time, so cyclehound keeps them by default.

The circular-import report agrees too: madge listed 13 cycles over 22 files;
cyclehound found the same 22 files in 8 components and listed 13 shortest
cycles through them.

**dependency-cruiser.** `depcruise --no-config --output-type json ventures`
against `cyclehound --graph --json --base . --no-type ventures` (type-only
imports left out, dependency-cruiser's default):

```
depcruise: 13140 nodes, 10443 edges; cyclehound: 12695 nodes, 10432 edges
common edges 10432; only depcruise 11; only cyclehound 0
```

Every edge cyclehound found is in dependency-cruiser's graph. The 11 it does
not have are all imports of `.css` files from Next.js and Vite apps;
cyclehound only makes JavaScript and TypeScript files nodes. The 445 extra
nodes are 360 `@/...` path-alias imports dependency-cruiser could not resolve
without a config, about 75 package and Node built-in names, and 10 CSS files.

## Where the tools differ

- **Directory imports.** `import "./lib"` meaning `./lib/index.mjs` resolves
  in cyclehound (as in bundlers and TypeScript). madge 8.0.0 skipped it with
  a warning in a test fixture
  ([`tests/fixtures/ring`](tests/fixtures/ring)). Node's own ES-module
  loader rejects directory imports, so for plain Node code madge's choice is
  the stricter one.
- **Self-imports.** A file importing itself is a component of one in
  cyclehound and is reported; madge drops the edge.
- **Path aliases.** madge and dependency-cruiser can read webpack and
  TypeScript `paths` settings (`@/lib/x`); cyclehound treats any
  non-relative import as a package and leaves it out. On this repository
  that hides 360 alias imports in a handful of Next.js apps, so their cycles
  are not checked. Reading `tsconfig.json` `paths` is the next slice.
- **The parser.** cyclehound does not build a syntax tree. Its lexer skips
  comments, strings, template literals (with nested `${}`) and regular
  expressions, and pattern-matches the tokens around `import`, `export` and
  `require`. The tests in [`tests/detect.rs`](tests/detect.rs) cover the
  look-alikes (imports in strings, comments, regexes and templates,
  `obj.import()`, `import.meta`, `{ import: 1 }`), and the edge-for-edge
  match above is the evidence on real code. A file it misreads would show as
  a missing or extra edge in that comparison.
- **Cycle listing.** madge prints the cycles its depth-first search meets,
  which can repeat a file across several lines and is not every cycle.
  cyclehound groups files into strongly connected components (Tarjan) and
  lists a shortest cycle through each file, so every file on any cycle
  appears at least once.

## What the cycles in this repository are

Over the whole repository (`cyclehound --ignore-dir fixtures .`, 0.28 s),
33 files sit in 10 circular components. Counting only imports that run when
the files load (`--no-type --no-dynamic --no-require`), 31 files in 9
components: `platform/distribution` (4 files), `platform/pages` writing and
podcast (2), `ai-bookkeeper` (two components, 6 files),
`babysitting-business-kit` (2), `league-schedule-generator` (3),
`shed-designer` (two components, 7 files) and one `retail-pilot-intel` docs
app (7 `.tsx`/`.ts` files). The `platform/pages` `build.mjs` and
`launched.mjs` pair is a cycle only through a dynamic `import()`.

None of them breaks today. Each of the 22 `.mjs` files on a load-time cycle
under `ventures/` was imported on its own as the entry point
(`node --input-type=module -e "await import('./<file>')"`), and all 22
loaded without error: the modules only use the names they import inside
functions. They are latent, not bugs; they would break if someone moved a
use of an imported value to the top level of a module.

## Reproducing

```sh
cd ventures/cyclehound && cargo build --release && cd ../..
npm install --prefix /tmp/bench madge@8 dependency-cruiser@16
python3 ventures/cyclehound/tests/bench/measure.py /dev/null /tmp/bench/node_modules/.bin/madge --circular --extensions mjs ventures
python3 ventures/cyclehound/tests/bench/measure.py /dev/null ventures/cyclehound/target/release/cyclehound --ext mjs ventures
```
