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
  TypeScript `paths` settings (`@/lib/x`). Until 2026-11-16 cyclehound
  treated any non-relative import as a package; it now reads tsconfig and
  jsconfig `paths` and `baseUrl` (next section), though not webpack or Vite
  aliases.
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

## Unused exports: against ts-unused-exports 11.0.1

`cyclehound --unused-exports` (added 2026-11-15) lists exports that no file
in the graph imports. The reference is
[ts-unused-exports](https://github.com/pzavolinsky/ts-unused-exports) 11.0.1
on TypeScript 5.6.3, run with `allowJs` over the same files. Both tools ran
on this repository's 11,736 `.mjs` files under `ventures/` (11,800 files
read once cyclehound followed imports into other extensions), Node 22.23.4,
4-core container, 2026-11-15. cyclehound ran with `--entries`, because
ts-unused-exports reports the exports of files nothing imports too.

| tool | wall time | peak memory | findings |
| --- | --- | --- | --- |
| ts-unused-exports 11.0.1 | 10.7 to 11.4 s (3 runs) | 368 to 390 MB | 6,222 |
| cyclehound `--unused-exports --entries --ext mjs` | 0.31 to 0.33 s warm, 2.96 s on a cold disk cache (3 runs) | 29 to 30 MB | 5,470 |

About 34 times faster in a thirteenth of the memory. The findings agree on
5,419 (file, name) pairs, a Jaccard agreement of 0.864
(`tests/bench/compare_unused.py`). Every difference was classified, by a
script for the bulk and by reading the source for the rest:

- **803 only ts-unused-exports reported.**
  - 527 are in modules a file loads whole with a dynamic import
    (`const calc = await import("./calc.mjs")`, then `calc[name]`).
    cyclehound counts a whole-module import as taking every export, since it
    cannot see which members are read; ts-unused-exports reports them. In
    this repository most are page tests that check *every* name an inline
    script imports, so counting them as used is right here; in other code
    it can hide a real unused export. A deliberate, conservative difference.
  - 252 are taken by a destructured dynamic import inside a function
    (`const { replay } = await import("./x.mjs")` in a test). cyclehound
    reads the destructured keys as names taken. ts-unused-exports reported
    these as unused; a two-file case reproduces it (an `await import()`
    destructured inside an async function is not counted). These are
    false positives in its report.
  - 24 others: 21 are whole-module dynamic imports in other shapes
    (`Promise.all([import("./a.mjs"), ...])`, `(await import("./a.mjs")).f()`),
    two are this tool's own test fixture (a namespace import), and one is a
    spelling difference (ts-unused-exports names a rest element `...restC`,
    cyclehound `restC`; both report it).
- **51 only cyclehound reported.**
  - 36 are a second or later name in one declaration
    (`export const A = "1450", B = "5000";`). ts-unused-exports does not
    report `B` when only `A` is imported; the same two-file case
    reproduces it. cyclehound is right on these: `B` is exported and nobody
    imports it.
  - 1 is a name inside an exported destructuring pattern, the same gap.
  - 10 are in `shift-roster-builder/hub.mjs`, which reaches its importers
    only through `export * from "./hub.mjs"` in `server.mjs`. The only
    importer of `server.mjs` takes four names, so the other ten exports of
    `hub.mjs` are unused; ts-unused-exports does not report them.
  - 4 are this tool's own test fixture.

So on this repository nearly every disagreement is either a choice
(whole-module imports count as taking everything) or a case where the
source shows cyclehound's answer is the right one.

Reproduce:

```sh
npm install --prefix /tmp/tue ts-unused-exports@11.0.1 typescript@5.6.3
cat > /tmp/tue/tsconfig.json <<'JSON'
{"compilerOptions": {"allowJs": true, "noEmit": true, "module": "esnext",
  "moduleResolution": "bundler", "target": "es2022"},
 "include": ["/ABSOLUTE/PATH/oss-monorepo/ventures/**/*.mjs"],
 "exclude": ["/ABSOLUTE/PATH/oss-monorepo/ventures/**/node_modules"]}
JSON
python3 ventures/cyclehound/tests/bench/measure.py /tmp/tue.txt node /tmp/tue/node_modules/.bin/ts-unused-exports /tmp/tue/tsconfig.json --showLineNumber
python3 ventures/cyclehound/tests/bench/measure.py /tmp/ch.txt ventures/cyclehound/target/release/cyclehound --unused-exports --entries --ext mjs ventures
python3 ventures/cyclehound/tests/bench/compare_unused.py /tmp/tue.txt /tmp/ch.txt ventures
```

knip also reports unused exports, but it needs a per-project entry
configuration to run on a tree like this one, so it was not measured.

## Reproducing

```sh
cd ventures/cyclehound && cargo build --release && cd ../..
npm install --prefix /tmp/bench madge@8 dependency-cruiser@16
python3 ventures/cyclehound/tests/bench/measure.py /dev/null /tmp/bench/node_modules/.bin/madge --circular --extensions mjs ventures
python3 ventures/cyclehound/tests/bench/measure.py /dev/null ventures/cyclehound/target/release/cyclehound --ext mjs ventures
```

## Path aliases (2026-11-16)

Measured at commit `4e4b8e60f` on the same 4-core container. The reference
here is not madge but TypeScript itself: what the compiler would resolve is
what the alias means.

[`tests/bench/ts_alias_edges.cjs`](tests/bench/ts_alias_edges.cjs) takes
every file in cyclehound's graph of `ventures/`, finds its nearest
`tsconfig.json` or `jsconfig.json` with `ts.findConfigFile`, parses it with
`ts.getParsedCommandLineOfConfigFile` (which follows `extends`), lists every
import with `ts.preProcessFile`, and resolves each bare specifier with
`ts.resolveModuleName` under that config's own options. Targets in
`node_modules` and `.d.ts` files are dropped, as cyclehound drops them.
TypeScript 5.9.3 from npm, Node v22.

```
16 configs, 2502 bare specifiers read
cyclehound alias edges 1436 typescript 1436 common 1436
```

"Alias edges" are the edges `cyclehound --graph --json ventures` has and
`cyclehound --graph --json --no-tsconfig ventures` does not (11,560 edges
without aliases, 12,996 with). The two sets are identical. The alias edges
add no new cycle in `ventures/` (12 components, 37 files, before and after)
and no broken alias (`--unresolved` lists the same 8 relative imports).
`--unused-exports` drops from 5,648 to 5,540 findings: 108 exports were
reported unused only because the files taking them did so through `@/`.

Cost: `cyclehound ventures` took 0.25 to 0.28 s and 20 to 21 MB with
aliases and 0.25 to 0.27 s and 19 to 20 MB without (three runs each,
`tests/bench/measure.py`); the whole repository, 13,847 files, 0.35 to
0.38 s either way. Each directory's config is looked up once and cached.

One `.mjs`-only edge changed: `--ext mjs` now follows an alias from
`quick-pick-survey/src/lib/groupRanking.ts` (reached from an `.mjs` file) to
`glicko2.ts`, so the 2026-11-13 madge comparison, which read `.mjs` without
aliases, should be rerun with `--no-tsconfig` to reproduce it.

## Dependencies: against depcheck 1.4.7 (2026-11-20)

Measured at commit `5e630e5ce` plus this change, on the same kind of 4-core
container, with Node 22.23.5. depcheck 1.4.7 is the current release on npm.

**Input.** Two sets of packages:

- this repository: every `package.json` outside `node_modules`, 32 packages
  (Next.js apps, Vite apps, Capacitor shells, a few Node tools), nothing
  installed;
- 153 popular npm packages as published
  ([`tests/bench/npm_corpus.txt`](tests/bench/npm_corpus.txt), fetched with
  `npm pack` on 2026-11-20, 57,394 files, 1.1 GB unpacked), which hold 442
  `package.json` files once the nested ones (`dist/esm/package.json` and the
  like) are counted; each is a package to both tools.

**How depcheck was run.** Through its API, once per package, in one Node
process with `NODE_PATH` removed from the environment. With `NODE_PATH` set
(this container points it at globally installed tools) depcheck resolves
`eslint` and `typescript` from the global folder and reports them used: its
answer depends on what the machine has installed, not on the project. On the
tarballs it ran with only its `bin` and `react17` specials, the two that read
nothing but JSON: its other specials `require()` the project's
`webpack.config.js`, `jest.config.js`, `.babelrc.js`, `next.config.js` and
similar files (`dist/special/webpack.js`, `jest.js`, `utils/index.js`
`tryRequire`), which runs code from the packages being checked. On this
repository it ran with every special (the default).

**Agreement.** [`tests/bench/compare_deps.cjs`](tests/bench/compare_deps.cjs)
runs `cyclehound --deps --depcheck --json` and depcheck on the same packages
and compares the three lists (unused `dependencies`, unused
`devDependencies`, missing) package by package.

| Set | Packages | depcheck findings | Packages that agree | Explained by depcheck parse failures |
|---|---|---|---|---|
| this repository | 32 | 81 | 32 | 0 |
| npm tarballs | 442 | 5,184 | 442 | 9 names in 9 packages |

depcheck's Babel parser rejected 56 files in the tarballs (mostly `.d.ts`
files with newer TypeScript syntax and bundled chunks); a package used only
in those files is "unused" or not "missing" to depcheck and the opposite to
cyclehound, whose lexer reads every file. The script counts a difference as
explained only when every use cyclehound found is in a file depcheck
rejected: `zod` (playwright-core), `@prisma/client` (@prisma/client),
`fsevents` (rollup's `dist/es`), `@types/estree` (rollup, svelte),
`@types/validator` (sequelize), `open` and `file:` (storybook),
`react-docgen` (@storybook/react). Nothing else differs.

Getting there took five depcheck behaviours that its README does not
describe, each now reproduced under `--depcheck` and pinned by a test in
[`tests/deps.rs`](tests/deps.rs):

1. A relative import becomes the package name `.` (require-package-name's
   rule), which depcheck then resolves as a folder; the folder is the package
   itself, so the package's own `peerDependencies` count as used. A package
   that declares a peer also as a devDependency never sees it reported unused
   (styled-components 6.6.0: `react-dom`, `css-to-react-native`; ts-node
   10.9.2: `@swc/core`, `@types/node`).
2. A package's own name resolves to itself when its package.json has
   `exports` (Node's self-reference), so its own `bin` makes its own name
   "used" by a script (rollup 4.68.7).
3. Parentheses around the string do not matter: webpack 5.113.0 writes
   `require(/** @type {string} */ ("webpack"))`.
4. URLs are dropped and webpack loader chains (`style-loader!css-loader!./x`)
   split only for `import` declarations and `require()`; in `export ... from`
   and `import()` an `https://` specifier becomes the package `https:`.
5. `import("x")` in a TypeScript type position is not a use (the default
   detectors leave out `typescriptImportType`), and `import type ... from "x"`
   uses only `@types/x` when that is declared.

The comparison also found a bug in cyclehound's lexer that the madge
comparison had not: `o.else / e` (a keyword as a property name, then a
division) started a regex literal. In next 16.4.6's bundled `@vercel/nft`,
one line of minified code, it hid 22 of the file's 23 `require()` calls. The
fix leaves the import graph of `ventures/` and of the tarballs byte-identical.

**Time and memory.** Wall clock for the whole set; cyclehound's peak RSS from
`getrusage`, depcheck's RSS at the end of its run (three cyclehound runs each).

| Set | depcheck 1.4.7 | cyclehound `--deps --depcheck` | cyclehound `--deps` |
|---|---|---|---|
| this repository (32 packages, 73,811 files walked) | 9.2 to 10.0 s, 285 to 305 MB | 0.52 to 0.61 s, 22 to 23 MB | 0.55 to 0.65 s, 22 to 24 MB |
| npm tarballs (442 packages, 57,394 files) | 341 to 369 s, 1.5 to 2.5 GB | 1.82 to 1.93 s, 171 to 185 MB | 2.47 to 2.73 s, 174 to 180 MB |

On the tarballs that is 180 to 200 times faster. depcheck was never slow on
this repository's small apps; it is on large published bundles, where its
Babel parse of every file dominates.

**The default mode.** Without `--depcheck`, the README's guesses (scripts and
config files with nothing installed, stylesheets, test pragmas, framework
peers, aliases) take this repository from 81 findings to 4, each checked by
hand:

- `ventures/ai-first-markets`: `esbuild` and `@eslint/eslintrc` appear in no
  file but package.json;
- `research/marriage-divorce-evidence/report-app`: `@lexical/history` is
  never imported (it arrives as a dependency of `@lexical/react`);
- `ventures/local-site-studio`: tsconfig `types` names `vite/client`, and
  `vite` is not declared (vitest brings it in transitively).

On the tarballs the default mode reports 4,582 findings against 5,183; most
of what remains is real for a published package (devDependencies for tests
and builds that are not shipped).

Reproduce:

```sh
cd ventures/cyclehound && cargo build --release
npm install --prefix /tmp/dc depcheck@1.4.7
node tests/bench/compare_deps.cjs /tmp/dc target/release/cyclehound ../..
mkdir -p /tmp/corpus/tgz /tmp/corpus/pkgs && cd /tmp/corpus/tgz
xargs -n1 npm pack --silent < ~/oss-monorepo/ventures/cyclehound/tests/bench/npm_corpus.txt
for t in *.tgz; do n=${t%.tgz}; mkdir -p ../pkgs/$n; tar -xzf $t -C ../pkgs/$n --strip-components=1; done
cd ~/oss-monorepo/ventures/cyclehound
node tests/bench/compare_deps.cjs /tmp/dc target/release/cyclehound /tmp/corpus/pkgs --safe-specials
```

**Other Rust tools.** `depcheck-rs` 0.0.28 (crates.io, MIT,
github.com/Dominionys/depcheck-rs) is a Rust port of depcheck, and `skif`
and `fallow` cover knip's ground. None was measured here: installing
third-party crates was not allowed in the session that wrote this section.
Running `depcheck-rs` through `compare_deps.cjs`'s package list is the next
comparison to make.
