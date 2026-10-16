# Docker Build Secrets Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/docker-build-secrets-check/>

A free tool that scans Dockerfiles for build-time secret exposure: `ENV` or
`ARG` instructions whose name looks like a secret, and `COPY`/`ADD` of a
handful of well-known credential files (`.env`, `id_rsa`, `.npmrc`,
`.aws/credentials`, ...) into the build context.

**What it is not:** a security audit, a compliance attestation, a value
scanner, or a guarantee that your build has no secret exposure. It is a
name-pattern heuristic over Dockerfile text -- it never sees what a build
actually resolves `ARG`/`ENV` to, so a genuine secret under an unrecognised
name is a false negative it cannot close, and a name that merely looks like
a secret (`API_KEY` holding a public identifier) is a false positive it
cannot rule out either. Read every finding.

## Why this exists

Docker's own "Build secrets" documentation states the problem directly:
passing a secret through `ARG` or `ENV` "is not recommended, since this data
is present in the final image" and can be viewed by anyone with access to it
using `docker history` or `docker inspect`. That is true whether the value
is a literal string in the Dockerfile or resolved from a build argument
(`ARG TOKEN`, then `ENV TOKEN=$TOKEN`) -- the resolved value is written into
the image's config layer either way, and stays there even if a later
instruction deletes the file it came from.

## Classification

- **env-secret** -- an `ENV` instruction whose name looks like a secret.
  Always flagged: an `ENV` value is unconditionally baked into the image
  config.
- **arg-literal** -- an `ARG` instruction whose name looks like a secret and
  carries a literal default value in the Dockerfile itself.
- **arg-declared** -- an `ARG` instruction whose name looks like a secret
  with no default value. Advisory only: nothing is committed to the
  Dockerfile, but the instruction invites a `--build-arg` secret that
  BuildKit still records for the build unless mounted as a build secret.
- **sensitive-copy** -- a `COPY` or `ADD` instruction naming a well-known
  credential file as a source.

`--fail-on-risk` trips on `env-secret`, `arg-literal`, and `sensitive-copy`.
`arg-declared` alone never does.

## Why there is no automatic remediation

Every finding comes with the exact `RUN --mount=type=secret,id=<name> ...`
form to use instead -- see
[the guide](how-to-pass-a-docker-build-secret-without-baking-it-into-the-image.html)
for the full worked example, including passing the value at build time with
`docker build --secret`. Nothing this tool does ever leaves your device: it
makes no network calls of its own, and it never asks for or handles your
actual secret material.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more Dockerfiles and get every finding
with its remediation -- nothing is uploaded, and the page itself makes no
network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan every Dockerfile under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any high-risk finding is found
```

Zero dependencies -- stdlib only, one file, nothing to install, no network
calls. Discovers `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` anywhere
under the given directory (skipping `.git` and `node_modules`). Wire
`--fail-on-risk` into your own CI to block a newly-added secret-looking
`ENV` or a copied credential file before it merges.

## Disclaimers

This tool answers one question: does a given Dockerfile instruction look
like it exposes a build-time secret. It does **not** verify that a flagged
name actually holds a secret, and a clean scan is not a security or
compliance claim about your build. Verify its output before relying on it,
the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only -- never transmitted, never tied to
a repository, a Dockerfile, or a secret value. Do Not Track and Global
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
what an instruction means.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate -- like
[`docker-base-image-pin-check`](../docker-base-image-pin-check/), this is a
direct graduation of an already-obvious, low-risk dev-tool idea, screened
against every existing venture, pipeline candidate, and screened-out row
with `duplicate_check.py` (top score 0.11). No external user contact has
happened yet -- that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
