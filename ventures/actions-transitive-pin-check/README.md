# Actions Transitive Pin Check

After using this, you can now confirm that a reusable workflow or composite
action you've pinned to a commit SHA doesn't itself load a third-party
action by a mutable tag — which used to be invisible, because every
existing pinning checker (including this portfolio's own
[`pinned-actions-check`](../pinned-actions-check/)) only reads the
`uses:` lines in the workflow file you scan, not what a pinned reference
itself calls.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/actions-transitive-pin-check/

**What it is not:** a security audit, a compliance attestation, or a
guarantee that your CI is safe from supply-chain attacks. It answers one
narrow question — does a reference you've already pinned to a commit SHA
load something else by a mutable tag one hop underneath it — and an
unresolved fetch is always reported as unresolved, never as clean.

## Why this exists

A workflow step like:

```yaml
- uses: octo-org/shared-workflows/.github/workflows/build.yml@2c4d34e6cff37bafe66eba7a6c1c8a5c9d9c1a6e
```

is pinned — that exact reference cannot be silently repointed. But the file
at that commit is itself a workflow, with its own `uses:` lines, and
nothing about pinning the *call site* pins what it calls. If
`build.yml@2c4d34e6...` has `- uses: some-org/deploy-action@main` inside
it, your workflow still runs whatever `main` currently resolves to — your
SHA pin never sees it, because it only pins the one hop you wrote.

This is a real, current gap, not a theoretical one. GitHub's own 2026
Actions security roadmap names it directly and describes a planned
"workflow lockfile" — pinning every direct and transitive action
dependency by commit SHA, the way a `go.sum` pins a Go module graph — as
the eventual fix, which means it isn't solved by SHA pinning alone today.

## Try it without installing anything

[`index.html`](index.html) does the same check in a browser. Paste a
workflow file, and for each pinned remote reference it fetches that exact
file from `raw.githubusercontent.com` (unauthenticated, no token) directly
from your browser and reports whether it loads anything unpinned.

## Quickstart (CLI)

```sh
node check.mjs                    # scan .github/workflows under the current directory
node check.mjs /path/to/repo      # scan a specific checkout
node check.mjs --format json      # machine-readable
node check.mjs --fail-on-risk     # exit 2 if a pinned reference loads an unpinned one
node check.mjs --no-network       # top-level classification only, no fetch (offline)
```

Zero dependencies — Node's built-in `fetch`, nothing to install. Wire
`--fail-on-risk` into your own CI to block a newly-added reference that is
pinned at the call site but loads something unpinned underneath.

## Disclaimers

This tool answers one question: does a reference already pinned to a
commit SHA load a third-party action by a mutable tag one hop underneath
it. It does **not** tell you whether the code at any resolved commit is
itself safe, and a clean result is not a security or compliance claim
about your repository. Verify its output before relying on it, the same as
any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy

The workflow YAML you paste in the browser is read locally and never
uploaded. Unlike `pinned-actions-check`, this tool **does** make network
requests — one per pinned reference it checks transitively, to
`raw.githubusercontent.com`, fetching only the exact public file that
reference names. The CLI makes this request from your machine; the browser
page makes it directly from your browser, so no server of ours ever sees
the request or its result. Uncheck "fetch and check" on the page, or pass
`--no-network` to the CLI, to skip this step entirely and see only the
top-level classification.

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository or workflow. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing.

## Development

```sh
node --test classify.test.mjs analyze.test.mjs check.test.mjs usage.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like its sibling `pinned-actions-check`, this is a direct
graduation of a narrow, well-evidenced dev-tool gap, not a pipeline
candidate write-up. No external user contact has happened yet — that is the
next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
