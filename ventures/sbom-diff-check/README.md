# SBOM Diff Check

A free tool that compares two SBOM (Software Bill of Materials) documents —
CycloneDX or SPDX JSON, from `syft`, `docker sbom`, `trivy`, `cdxgen`, or
similar — and reports exactly which packages were added, removed, or changed
version between two builds.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/sbom-diff-check/

**What it is not:** a vulnerability scanner, a license checker, or a
compliance attestation. It compares only each package's name and version; it
makes no claim about whether any package or version is safe, vulnerable, or
appropriately licensed.

## Why this exists

A raw `diff` between two SBOM files is close to useless for answering "what
changed": both CycloneDX and SPDX documents embed a serial number, a
generation timestamp, and the generating tool's own version, all of which
differ on every single run even when the package list is byte-for-byte
identical. On a real SBOM with hundreds of components, the one line that
matters is buried inside dozens that changed for no reason anyone cares
about. This tool reads only each component's name and version and ignores
everything else.

## Why nothing is uploaded

An SBOM is a complete inventory of a build's dependencies, and for a
proprietary product that inventory itself can be sensitive — internal
package names, an unreleased component, or the shape of the dependency tree.
Pasting it into a third-party web tool just to answer "what changed" is a
real information disclosure for a question that does not need one. Both
files stay in your browser; nothing is uploaded, and the tool makes no
network calls of its own.

## Try it without installing anything

[`index.html`](index.html) reads the same comparison logic in a browser
page. Paste the before and after SBOM JSON and get the added, removed, and
version-changed packages.

## Quickstart (CLI)

```sh
python3 sbom_diff.py old.json new.json                  # human-readable
python3 sbom_diff.py old.json new.json --format json     # machine-readable
python3 sbom_diff.py old.json new.json --fail-on-change  # exit 2 if anything differs
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. Wire `--fail-on-change` into your own CI to catch an unexpected
dependency drift before it merges.

## Formats understood

- **CycloneDX** (`"bomFormat": "CycloneDX"`, or a top-level `components`
  array) — reads each component's `name`, `version`, and `purl`. Nested
  `components` are included, and a `group` is prefixed to the name
  (`@types` + `node` is `@types/node`), so same-named packages from
  different groups are not merged.
- **SPDX** (a `spdxVersion` field, or a top-level `packages` array) — reads
  each package's `name` and `versionInfo` (`NOASSERTION` is treated as no
  known version).

The two formats can be mixed — only name and version are compared, and both
formats expose both fields.

## Multi-version packages

Packages are matched by name, and the *set* of versions recorded under each
name is compared rather than assuming exactly one. A monorepo pulling in two
versions of the same library through different paths is reported as a
version gained or lost, not silently collapsed to one or crashed on.

## Disclaimers

This tool answers one question: which packages differ, by name and version,
between two SBOM documents. It does **not** tell you whether an added or
updated package is safe, vulnerable, or appropriately licensed. Verify its
output before relying on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`diff_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository, an SBOM, or a package name. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing.

## Development

```sh
python3 -m unittest test_sbom_diff -v
node --test diff.test.mjs
node --test page.test.mjs
node --test usage.test.mjs
```

`diff.test.mjs` includes a parity test that shells out to `python3
sbom_diff.py` and asserts the browser port produces the same added/
removed/version-changed lists on the same fixture, so the CLI and the page
can never silently disagree about what changed.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`docker-base-image-pin-check`](../docker-base-image-pin-check/), this is a
direct graduation of an already-obvious, low-risk dev-tool idea, following
`portfolio/pipeline/README.md`'s "archetype itself" guidance to weigh a
CLI/checker shape over another `<trade>-bid-calculator`. No external user
contact has happened yet — that is the next, non-code step (see
`kill_criteria` in `VENTURE.yaml`).
