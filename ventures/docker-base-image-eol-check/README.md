# Docker Base Image EOL Check

A free tool that scans Dockerfiles and flags every `FROM` line whose base
image release line (`node:18`, `python:3.9`, `ubuntu:20.04`, ...) has passed
its publisher's own end-of-life date, or is due to soon — using a small,
curated, dated table checked into the tool, never a live lookup. Also flags
image repositories discontinued outright by their publisher (`openjdk`).

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/docker-base-image-eol-check/

**What it is not:** a vulnerability scan, a security audit, or a compliance
attestation. It answers one narrow question — has this specific release line
passed the date its own publisher (or that publisher's own stated
support-length policy) names as when patches stop — and it never resolves
anything over the network on your behalf.

## Why this exists

Digest-pinning a base image (see the sibling
[`docker-base-image-pin-check`](../docker-base-image-pin-check/)) stops a
reference from being silently repointed to different bytes. It says nothing
about whether the release line those bytes belong to is still receiving
security patches. A Dockerfile can pin `FROM node:18` to an exact digest and
still build on a Node release that stopped getting fixes months ago —
pinning and end-of-life are independent questions, and nothing else in this
fleet checked the second one before this tool.

A vulnerability scanner (Trivy, Grype, Docker Scout) answers a related but
different question too: it needs your image built or pulled, and it reports
CVEs already matched against the packages inside it. A release line that has
gone end-of-life is not necessarily full of already-known CVEs — it can show
a clean scan today and still be a release nobody is looking for new issues
in, which is exactly the case a scanner cannot surface and this tool exists
to name directly. See
[`vs-a-vulnerability-scanner.html`](vs-a-vulnerability-scanner.html) for the
full comparison.

## This is a curated snapshot, not a live feed

Every row in the end-of-life table (`EOL_DATA` in both `check.py` and
`classify.mjs`) carries:

- **`source`** — the project whose own release schedule, or stated
  support-length policy, the date was read from.
- **`confidence`** — `confirmed` when the project names that exact date
  itself, `estimated` when the date is inferred from that project's own
  policy applied to its release date, because the project does not publish a
  fixed end date this far in advance.

Every finding is stamped with the dataset's own `DATASET_AS_OF` snapshot
date. **Re-verify a finding against the upstream project's own page before
relying on it**, especially an `estimated` row, and especially long after
that snapshot date.

## Try it without installing anything

[`index.html`](index.html) reads the same classification logic in a browser
page. Paste the contents of one or more Dockerfiles and get every base image
past (or nearing) end-of-life — nothing is uploaded, and the page itself
makes no network requests.

## Quickstart (CLI)

```sh
python3 check.py                  # scan every Dockerfile under the current directory
python3 check.py /path/to/repo    # scan a specific checkout
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any base image is eol or deprecated-image
python3 check.py --warn-days 30   # narrow the eol-soon warning window (default 90)
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Discovers `Dockerfile`, `Dockerfile.*`, and `*.dockerfile` anywhere
under the given directory (skipping `.git` and `node_modules`). Wire
`--fail-on-risk` into your own CI to block a base image release that has
already gone end-of-life.

## Classification

- **eol** — the release line's end-of-life date has passed.
- **eol-soon** — within `--warn-days` (default 90) of end-of-life.
- **supported** — neither of the above, per the checked-in table.
- **deprecated-image** — the image repository itself was discontinued by its
  publisher (e.g. `openjdk`, superseded by `eclipse-temurin`), independent of
  tag.
- **unknown-tag** — no tag, `latest`, or a tag the normalizer could not read
  as a release line. Skipped — resolve what `latest` currently means and
  re-run with an explicit tag.
- **unknown-image** — the image is not in this tool's curated table. Not
  evidence of anything either way.
- **stage** / **scratch** / **variable** — same meaning as in
  `docker-base-image-pin-check`: not a registry pull, skipped.

Covered families today: Node.js, CPython, Ubuntu, Debian, Alpine, PHP, Ruby,
plus the `openjdk` → `eclipse-temurin` deprecation. Go is deliberately not
covered — Go supports only a rolling window of its two most recent minor
releases rather than fixed per-version dates, which this tool's dated-table
shape cannot represent honestly.

## Disclaimers

This tool answers one question: has a given base image release line passed
the end-of-life date this tool's curated table names for it. It does **not**
scan for vulnerabilities, does **not** inspect installed packages, and a
clean result is not a security or compliance claim about your build. Verify
its output — especially an `estimated` row — before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to a
repository, a Dockerfile, or an image name. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs
node --test usage.test.mjs
node --test page.test.mjs
```

`classify.test.mjs` includes a parity test that shells out to `python3
check.py --dump-data` and asserts the browser table is byte-identical to the
CLI's, so the two data tables can never silently drift apart.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`docker-base-image-pin-check`](../docker-base-image-pin-check/), this is a
direct graduation of an already-obvious, low-risk dev-tool idea, following
`portfolio/pipeline/README.md`'s "archetype itself" guidance to weigh a
CLI/checker shape with a genuinely new question over another `<trade>-bid-
calculator` or a duplicate of an existing checker. No external user contact
has happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
