# package.json Exports Drift Check

A free tool that flattens a `package.json` **`exports`** map — every
subpath, every nested condition (`import`/`require`/`types`/...), every
fallback array — and checks that each **literal file target actually
exists**, naming every one that doesn't. That's the exact gap behind
Node's `ERR_PACKAGE_PATH_NOT_EXPORTED` and `Cannot find module` errors that
show up only after a stranger runs `npm install`, never on the maintainer's
own machine where the build has usually already run.

**Live tool:** https://marisstella.app/package-exports-drift-check/

It also has a **resolver**: type `my-lib/feature`, `./feature` or
`#internal`, pick `import` or `require` and any extra conditions, and it
names the file Node picks and the key, condition and fallback that decided
it. The resolver is Node 22's own algorithm, and a differential test
checks it against the `node` that runs the test (see "How the resolver was
checked").

**What it is not:** a bundler or a publish tool. It never runs your
package, never follows imports from one file to the next, and never reads
a file's contents.

After using this, you can now **catch the exact broken `exports` target
before you publish, in the same CI step that runs your build**, which used
to take **a user filing an issue titled "Cannot find module" against a
version you already shipped**.

## Why this exists

Node's `exports` field is a contract: for every subpath it names, exactly
one file (per condition) is what a consumer's `import`/`require` resolves
to. Nothing about how most packages are built keeps that contract true on
its own — a build tool renames its output directory, a refactor moves the
entry file, or `npm publish` runs a beat before the build finishes, and the
`exports` map goes on pointing at where the file used to be. It is the
config-file sibling of this portfolio's other zero-dependency checkers:
same deterministic, no-network, no-verdict shape as
[`env-example-drift-check`](../env-example-drift-check/) and
[`structured-data-drift-check`](../structured-data-drift-check/), applied
to a package's `exports` map and the files it actually ships instead of an
`.env.example` file or a page's own JSON-LD.

## Try it without installing anything

[`index.html`](index.html) parses both text boxes entirely in the browser.
Paste your `package.json` and a listing of the files you actually publish
(`npm pack --dry-run`'s "Tarball Contents", `git ls-files`, or a plain file
listing) and it lists every `exports` target that's missing. Nothing you
paste ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the local `package.json`
you point it at — no network call, ever.

```sh
node cli.mjs check                        # ./package.json
node cli.mjs check path/to/package.json
node cli.mjs check --json                  # machine-readable
node cli.mjs resolve my-lib/feature        # which file `import "my-lib/feature"` reaches
node cli.mjs resolve my-lib/feature --require --conditions=development
node cli.mjs resolve '#utils/format'       # through "imports"
```

Run it **after your build step and before `npm publish`** — it checks what
is on disk right now, so running it before the build has produced anything
will read every export as missing. Exits 1 if any target is missing, invalid
or reaches no file, or the map itself is invalid; `resolve` exits 1 when the
import fails or the file it reaches is not on disk. More, including wiring this into CI as the last gate before
publish: [the docs page](why-package-json-exports-fields-drift-from-what-you-actually-publish.html).

## What's checked, per shape

| Shape | Handling |
|---|---|
| A literal path, any subpath, any condition nesting, any fallback array position | Checked against the file listing / filesystem |
| A wildcard target (`"./features/*": "./src/features/*.js"`) | Matched against the file listing (every `*` filled with the same text, as Node does); reported **no file** if it reaches none |
| A target Node refuses: no leading `./` (`"dist/index.js"`, `"other-pkg/sub"`), `"../x"`, an absolute path or URL, a `.`, `..` or `node_modules` segment | Reported **invalid**: Node throws `ERR_INVALID_PACKAGE_TARGET`. Earlier versions skipped these as "re-exports of another package", but `exports` cannot point at another package; only `imports` can |
| A folder-mapping key ending in `/` with no `*` (`"./lib/": "./lib/"`) | Reported **invalid**: Node 17 removed folder mappings, so no import matches the key (`ERR_PACKAGE_PATH_NOT_EXPORTED`). The CLI used to pass it because the folder exists on disk; a directory no longer counts as a target, and a wildcard file whose `*` part holds a `node_modules` or `.` segment no longer counts as reached |
| A map mixing `"."` keys with condition keys; a numeric condition key | Reported **config**: Node throws `ERR_INVALID_PACKAGE_CONFIG` |
| `null` (explicitly blocked subpath) | Not a file target, ignored — intentional, correct `package.json` |
| Top-level `main` / `module` / `types` fields | Not read in v0 — see the docs page |

## How the resolver was checked

[`resolve.mjs`](resolve.mjs) is written from the resolution algorithm in
Node's documentation (`doc/api/esm.md`, PACKAGE_EXPORTS_RESOLVE,
PACKAGE_IMPORTS_RESOLVE, PATTERN_KEY_COMPARE, PACKAGE_TARGET_RESOLVE),
following Node's code where it is looser than the prose (a pattern key
still matches a subpath ending in `/`, with deprecation DEP0155; an empty
`//` segment is a warning, not an error).

[`resolve.diff.test.mjs`](resolve.diff.test.mjs) generates a few hundred
packages from a seed, each with random `exports` and `imports` maps built
from the shapes that trip people up (pattern keys of different
specificity, nested conditions, fallback arrays holding invalid items,
`null` blocks, `..`, `node_modules` and `%2e` segments, targets without
`./`, numeric condition keys, mixed `.` and condition keys). It asks a
child `node` to resolve the same specifiers three ways (ESM `import`, ESM
with `--conditions=development`, CommonJS `require`) and compares the file
or error code. ESM's `import.meta.resolve` answers without opening the
file, so the URL is compared exactly; `require` needs the file, so the path
in its `MODULE_NOT_FOUND` message is compared. A second test checks the
default condition sets (`node`, `import`/`require`, `module-sync`,
`node-addons`) against the same Node.

Run on Node 22.23.5 on 2026-11-22: the default seed gives **5,079
resolutions, 0 disagreements**; seeds 1 to 5 at 1,000 packages each gave
17,100, 17,019, 17,064, 17,037 and 17,166 resolutions, **0 disagreements**
in each. About a fifth of the cases resolve to a file; the rest end in
each of Node's five resolution errors, so the error paths are tested as
hard as the happy one. To rerun with other numbers:
`RESOLVE_DIFF_SEED=7 RESOLVE_DIFF_PACKAGES=1000 node --test resolve.diff.test.mjs`.

Getting to zero found four things worth knowing, all now in the code: a
non-object `exports` (`1`, `true`) is read as no `exports` at all, so Node
falls back to `main`; `require("#x")` from a package with no `imports`
field is looked up as an ordinary package name, while `import` throws
`ERR_PACKAGE_IMPORT_NOT_DEFINED`; an `imports` target of `""` is handed on
as a package name; and `#/x` is still invalid in Node 22.

## Disclaimers

This tool reports whether a literal path named in `package.json`'s
`exports` map exists, checked against a file listing or filesystem you
provide. It is **not a bundler or a publish tool** — it never runs your
code, follows imports between files, or guarantees your package will install or
import cleanly. Verify with `npm publish --dry-run` and a real install
before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`resolve_run`, `example_loaded`) in `localStorage` only — never transmitted, never tied to
the text you pasted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns it off entirely. The CLI records nothing and
makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs resolve.test.mjs resolve.diff.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine, CLI,
and browser page are built and tested; no external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
