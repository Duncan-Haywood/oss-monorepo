# License Drift Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/license-drift-check/>

A free tool that diffs two point-in-time snapshots of a dependency tree's
declared licenses — and tells you exactly which packages' **license**
changed since the last one. Not their version. Their license.

**What it is not:** a legal opinion, a compliance certifier, or a
substitute for reading the actual license text. It answers one narrow
question — did this package's declared license string change between these
two snapshots — deterministically, from the snapshots themselves, with no
model and no guessing.

After using this, you can now **catch a dependency's license change in the
same PR that bumped its version**, which used to take **nobody noticing
until an audit, a legal review, or a blog post pointed it out months
later.**

## Why this exists

Four widely used open-source projects relicensed away from a permissive or
weak-copyleft license in a way that reached their existing users through a
routine version bump, not an announcement anyone read in time:

| Project | From | To | Date | What followed |
|---|---|---|---|---|
| MongoDB Server | AGPL-3.0 | SSPL-1.0 | 2018-10-16 | The event that introduced the SSPL |
| Elasticsearch & Kibana | Apache-2.0 | SSPL-1.0 / Elastic License | 2021-01-14 | AWS forked the last Apache-2.0 release as OpenSearch within three months |
| Terraform (HashiCorp) | MPL-2.0 | BUSL-1.1 | 2023-08-10 | The OpenTF Manifesto gathered 33,000+ GitHub stars within a month; became OpenTofu, now a CNCF project |
| Redis | BSD-3-Clause | SSPLv1 / RSALv2 | 2024-03-20 | Forked as Valkey under the Linux Foundation within days, backed by AWS, Google Cloud, and Oracle |

**Dependabot and Renovate both solve a different problem well, and neither
solves this one.** They watch a registry for a newer version and open a
pull request with the version delta, changelog, and a compatibility
signal. Neither diffs the *license* field between the version you have and
the version they're proposing — that comparison isn't part of what either
tool was built to make. A license change rides along inside an
otherwise-routine version-bump PR with nothing calling it out, and that is
exactly the mechanism that carried each of the four changes above into
projects that never chose to accept them.

License-checker-style tools (`license-checker`, `licensee`, FOSSA, Snyk)
answer a different question too: what license does this dependency have
*right now*. They are excellent at that, and none of them are built to
answer "is that different from what it was last time I looked" — which is
the one this tool exists for, in exactly the shape
[`coverage-drop-check`](../coverage-drop-check/) already uses for coverage
XML: diff two point-in-time reports, name exactly what moved.

## Try it without installing anything

[`index.html`](index.html) parses two pasted JSON or CSV snapshots entirely
in the browser — paste a baseline and a current snapshot, click Compare, and
get a report of exactly which packages changed license, which were added,
and which were removed. No fetch happens from the page itself, so nothing
you paste ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. `snapshot` reads only local
`package.json` files already on disk; `diff` reads only the two files you
name. Neither makes a network call.

```sh
node cli.mjs snapshot --out baseline.json          # commit this once, after review
# ...time passes; npm install / npm update / a Dependabot PR merges...
node cli.mjs snapshot --out current.json
node cli.mjs diff baseline.json current.json       # human-readable; exits 1 if anything changed
node cli.mjs diff baseline.json current.json --json
node cli.mjs diff baseline.json current.json --ignore left-pad,is-odd   # accept a specific change
```

Other ecosystems: `pip-licenses --format=json`, `go-licenses csv`, and
`cargo license --json` all produce a format this reads directly or with a
one-line conversion — see
[the docs page](how-a-dependency-license-change-reaches-your-lockfile.html)
for exact commands, and a ready-to-paste CI step.

**Scope, stated plainly.** `snapshot` reads the flat, top-level
`node_modules` layout npm produces for direct and hoisted dependencies (one
level, plus one level into `@scope/` directories) — a package that exists
only nested, pinned to a version different from the hoisted copy, is not
captured separately. Run it right after `npm ci` for the most complete
picture. The license *family* label (permissive/copyleft/source-available)
is a keyword match against well-known public license strings, not a legal
determination — see the docs page for the one mix-up ("BSL") worth reading
before you trust it.

## Disclaimers

This tool reports a factual difference between two snapshots you supply.
It is **not legal advice** about any license, and the family label is an
informational keyword match, not a legal opinion about a specific
license's terms or your specific use. Verify with counsel before relying
on it, the same as any free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
your dependency tree or a repository. Do Not Track and Global Privacy
Control are honoured, and a button on the page turns it off entirely. The
CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine and
CLI are built and tested; no external user contact has happened yet — that
is the next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
