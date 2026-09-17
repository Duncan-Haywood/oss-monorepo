# Dependency Confusion Check

A free tool that scans pip and npm configuration for the two documented
configuration shapes behind the 2021 dependency-confusion incidents
(Alex Birsan's research against Apple, Microsoft, PayPal, Netflix, Uber,
Tesla, and others):

1. **pip `--extra-index-url`** — pip's own documentation names this as a
   risk: the additional index can specify a version of a package that gets
   installed instead of the one from `--index-url`, because pip compares
   versions across every configured index and installs whichever reports
   the higher number for a given name. A public package published under
   your internal package's name, at a higher version, wins.
2. **An unscoped npm dependency name behind a private registry** — when a
   repository's `.npmrc` sets a bare `registry=` to a private host, that is
   the default for every unscoped dependency, public or internal. A machine
   or CI runner without that `.npmrc` in effect falls back to the public npm
   registry for the same name — and if nobody has claimed it there, an
   attacker can.

**What it is not:** a security audit, a compliance attestation, or a
registry lookup. It makes no network calls of any kind, so it cannot tell
you whether a flagged name is actually claimed (or claimable) on the public
registry — only that the configuration shape is present. The npm check in
particular flags **every** unscoped dependency once a private registry is
configured, including already-public packages (a dependency on `left-pad`
looks identical, from a read-only view of `package.json`, to an internal
package of the same shape) — read each flagged name and judge which ones you
actually intend to keep private.

## Why this exists

Birsan's 2021 research showed the same root cause in two different
ecosystems: a resolver told about two places a package might live, with no
rule that says the internal one always wins. Both patterns here are
static, one-time configuration mistakes rather than a runtime exploit — the
kind of thing worth catching in review or CI before a build ever runs
against the wrong index.

## Why there is no automatic remediation, and no registry lookup

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own — not even to check whether a name
you depend on is actually claimed publicly. It flags the configuration
shape and explains the fix (an exclusive `--index-url` for pip, a scoped
package name for npm); applying that fix, and deciding which flagged names
are genuinely internal, is left to you.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste your `requirements.txt`/`pip.conf`, `package.json`, and
`.npmrc` and get every finding, each with its fix — nothing is uploaded,
and the page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan a repository checkout
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-risk` into your own CI to block a newly-added finding
before it merges. It reads the repository root's `requirements*.txt`,
`constraints*.txt`, `pip.conf`/`pip.ini`, `.github/workflows/*.yml`/`*.yaml`,
`package.json`, and `.npmrc` — it does not recurse into subdirectories, so a
monorepo with per-package manifests needs each scanned separately.

## Disclaimers

This tool checks for two specific, well-documented configuration patterns.
It does **not** tell you whether your supply chain is secure overall, and a
clean scan is not a security or compliance claim. It does not parse
`Pipfile`, `poetry.lock`, `pnpm-lock.yaml`, or `yarn.lock`, and it never
queries any package registry. Verify its output before relying on it, the
same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only —
never transmitted, never tied to a repository or a package name. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes parity tests that shell out to `python3
check.py` and assert the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line or a dependency name means — following
`actions-cache-poisoning-check/classify.test.mjs`'s discipline.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`actions-cache-poisoning-check`](../actions-cache-poisoning-check/),
[`actions-injection-check`](../actions-injection-check/), and
[`pinned-actions-check`](../pinned-actions-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea tied to a
well-documented, verifiable incident class. No external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
