# Docker Base Image Pin Check

A free tool that scans Dockerfiles and flags every `FROM` line whose base
image is referenced by a mutable tag (`node:18`, `python:3.11-slim`, or bare
`latest`) instead of a pinned content digest (`@sha256:...`) — a documented
Docker/SLSA supply-chain hardening practice, not a novel claim.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/docker-base-image-pin-check/

**What it is not:** a security audit, a compliance attestation, or a
guarantee that your build is safe from supply-chain attacks. It answers one
narrow question — is this specific `FROM` line pinned to a content digest —
and it does not resolve anything on your behalf: it prints the exact `docker
buildx imagetools inspect` command so you can look up the digest yourself.

## Why this exists

A Dockerfile line like `FROM node:18` trusts whatever bytes the tag `18`
currently points to. Nothing stops the image's publisher from pushing a new
build to that same tag tomorrow — and unlike a version bump you would
review, a rebuild of an *existing* tag is silent: your next `docker build`
just pulls different bytes under the same name, with no diff anywhere to
notice. A content digest addresses one exact set of bytes and cannot be
repointed, which is why a workflow pinned to a digest is unaffected by a
later push to the tag it came from.

**The specific-looking tag is the trap.** `node:18` reads as more careful
than bare `node` or `node:latest`, and it is not pinned in the sense that
matters: Docker still resolves it to whatever the `18` tag points at right
now. This is the one distinction the tool exists to draw.

## Why there is no automatic digest resolution

Privacy-first, on purpose: nothing this tool does ever leaves your device,
and it makes no network calls of its own — not even to look up a digest for
you. Resolving a mutable tag to a digest means asking a registry something,
and this tool would either need to be a server that sees every Dockerfile
pasted into it, or fetch on your behalf, neither of which is worth the
convenience next to printing the one command you can run yourself with your
own network access and your own judgment about whether to trust the result.
Every mutable finding therefore comes with the exact `docker buildx
imagetools inspect` command to run instead of a resolved answer.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more Dockerfiles and get every unpinned
base image, each with its remediation command — nothing is uploaded, and the
page itself makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan every Dockerfile under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any mutable (unpinned) base image is found
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Discovers `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` anywhere
under the given directory (skipping `.git` and `node_modules`). Wire
`--fail-on-risk` into your own CI to block a newly-added unpinned base image
before it merges.

## Classification

- **pinned** — the reference includes `@<algorithm>:<hex digest>`.
- **mutable** — a tag, even a specific one, or no tag at all (which resolves
  to `:latest`). Flagged.
- **stage** — the reference names an earlier `FROM ... AS <name>` build
  stage in the same file, not a registry pull. Skipped.
- **scratch** — `FROM scratch`, Docker's empty virtual base image. Cannot be
  repointed. Skipped.
- **variable** — the reference contains a build-arg substitution (`$FOO` /
  `${FOO}`), so the actual image cannot be determined from the file alone.
  Skipped — resolve the build arg yourself and re-run.

## Disclaimers

This tool answers one question: is a given `FROM` line pinned to a content
digest. It does **not** tell you whether the code inside that image is
itself safe, and a clean scan is not a security or compliance claim about
your build. Verify its output before relying on it, the same as any free,
best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository, a Dockerfile, or an image name. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns it off
entirely. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs
node --test page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py` and asserts the browser port produces byte-identical findings on
the same fixture, so the CLI and the page can never silently disagree about
what a line means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`pinned-actions-check`](../pinned-actions-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea, following
`portfolio/pipeline/README.md`'s "archetype itself" guidance to weigh a
CLI/checker shape over another `<trade>-bid-calculator`. No external user
contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
