# package.json Exports Drift Check

A free tool that flattens a `package.json` **`exports`** map — every
subpath, every nested condition (`import`/`require`/`types`/...), every
fallback array — and checks that each **literal file target actually
exists**, naming every one that doesn't. That's the exact gap behind
Node's `ERR_PACKAGE_PATH_NOT_EXPORTED` and `Cannot find module` errors that
show up only after a stranger runs `npm install`, never on the maintainer's
own machine where the build has usually already run.

**What it is not:** a bundler, a publish tool, or a resolver. It never runs
your package, never resolves an import graph, and never reads a file's
contents — only whether each literal path named in `exports` exists.
Wildcard targets (`"./features/*"`) and bare-specifier re-exports of
another package are reported as **not checked**, never as passing or
failing.

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
```

Run it **after your build step and before `npm publish`** — it checks what
is on disk right now, so running it before the build has produced anything
will read every export as missing. Exits 1 if any literal export target is
missing. More, including wiring this into CI as the last gate before
publish: [the docs page](why-package-json-exports-fields-drift-from-what-you-actually-publish.html).

## What's checked, per shape

| Shape | Handling |
|---|---|
| A literal path, any subpath, any condition nesting, any fallback array position | Checked against the file listing / filesystem |
| A wildcard target (`./features/*`) | Skipped — needs pattern matching against real files, out of scope for v0 |
| A bare specifier re-exporting another package | Skipped — nothing on disk to check |
| `null` (explicitly blocked subpath) | Not a file target, ignored — intentional, correct `package.json` |
| Top-level `main` / `module` / `types` fields | Not read in v0 — see the docs page |

## Disclaimers

This tool reports whether a literal path named in `package.json`'s
`exports` map exists, checked against a file listing or filesystem you
provide. It is **not a bundler or a publish tool** — it never runs your
code, resolves an import graph, or guarantees your package will install or
import cleanly. Verify with `npm publish --dry-run` and a real install
before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
the text you pasted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns it off entirely. The CLI records nothing and
makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine, CLI,
and browser page are built and tested; no external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
