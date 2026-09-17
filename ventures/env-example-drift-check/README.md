# .env.example Drift Check

A free tool that diffs an `.env.example` (or `.env.sample`) file's declared
variable names against the environment variables **actually read by a
repo's own source code** (`process.env.X` in JS/TS, `os.getenv`/
`os.environ` in Python, `ENV[]` in Ruby, `System.getenv` in Java) —
naming every variable the code reads that the example file never
mentions, and every variable the example file declares that no code path
reads anymore.

**What it is not:** a secrets scanner, a `.env`-format linter, or a
compliance verdict. It never reads or reports a *value* on either side —
only variable *names* — and it makes no claim about whether your
configuration is complete or safe, only whether the two lists match.

After using this, you can now **catch the exact variable a new
contributor's `cp .env.example .env` is about to be missing, in the same
pull request that added the read**, which used to take **nobody
noticing until a fresh clone crashed on first run, or a new hire spent an
afternoon guessing at an undocumented variable from a stack trace.**

## Why this exists

`.env.example` exists to be a contract: clone the repo, copy it to `.env`,
fill in real values, and the app has everything it needs. Nothing about
how most repos are built keeps that contract true on its own — a pull
request adds a new `process.env.FOO` read, the tests pass because the
test environment stubs the value directly, and updating the example file
in the same diff is a manual step no build or type check enforces. It is
one of the most common README-vs-reality gaps in open source, and one of
the most visible: it fails the very first command a new contributor or a
CI runner runs after cloning, not some rarely-exercised code path.

`env-example-drift-check` is the config-file sibling of this portfolio's
other zero-dependency checkers: same deterministic, no-network, no-verdict
shape as
[`structured-data-drift-check`](../structured-data-drift-check/) and
[`license-drift-check`](../license-drift-check/), applied to an
`.env.example` file and the code that reads it instead of a page's own
markup or a dependency snapshot.

## Try it without installing anything

[`index.html`](index.html) parses both text boxes entirely in the browser.
Paste your `.env.example` and the source code that reads it, and it lists
every variable that's missing or stale. Nothing you paste ever leaves
your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the local files/directories
you name — no network call, ever.

```sh
node cli.mjs check --example .env.example src               # one directory, human-readable
node cli.mjs check --example .env.example . --json             # whole tree (node_modules, .git, etc skipped)
node cli.mjs check --example .env.example src app.py           # a mix of directories and files
node cli.mjs check --example .env.example src --strict          # also fail on unused declared vars
```

Exits 1 if any variable is read in code but missing from the example file
(or, with `--strict`, also if any is declared but never read). Exits 0
otherwise.

More, including wiring this into CI as a gate:
[the docs page](why-env-example-files-drift-from-the-code-that-reads-them.html).

## What's scanned, per language

| Language | Patterns matched |
|---|---|
| JavaScript / TypeScript | `process.env.FOO`, `process.env["FOO"]` |
| Python | `os.getenv("FOO")`, `os.environ["FOO"]`, `os.environ.get("FOO")` |
| Ruby | `ENV["FOO"]`, `ENV.fetch("FOO")` |
| Java | `System.getenv("FOO")` |

Matched one line at a time, name only — never a value. Shell scripts,
YAML/Compose files, and dynamically-built config reads are out of scope
for v0.

## Disclaimers

This tool reports whether a variable name appears in an `.env.example`
file and whether that same name is read anywhere in the scanned source.
It is **not a secrets scanner** — it never reads or shows a value on
either side — and it is not a guarantee that your configuration is
complete or safe. Verify by reading the actual files before relying on
it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied
to the text you pasted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine,
CLI (with directory walking), and browser page are built and tested; no
external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
