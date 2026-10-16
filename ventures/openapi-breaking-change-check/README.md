# OpenAPI Breaking Change Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/openapi-breaking-change-check/>

A free tool that compares two OpenAPI 3.0/3.1 JSON documents and classifies
every difference as a **breaking change** or not: a removed operation, a
parameter that is new or became required, a narrowed parameter type, a
removed enum value a client could still send, or a request body that became
required. Everything else — a new optional parameter, a new endpoint, a
widened enum — is reported separately as non-breaking.

**What it is not:** a full request/response body schema diff, a security
review, or a compatibility guarantee. It is a shallow, structural comparison
of paths, operations, and parameter/request-body shape; it makes no claim
about a field changed deep inside a request or response body's JSON Schema,
and no claim that a clean result means the change is safe to ship for every
client.

## Why this exists

A code review of the *implementation* of a new API version does not catch a
contract break: a required parameter added to an endpoint the frontend
already calls, or an endpoint quietly removed during a refactor, both look
like ordinary code to a reviewer who is not also holding the whole API
contract in their head. A raw text diff of the two spec files does not help
much either — it shows every reordered key and reworded description with the
same weight as the one parameter that actually changed, and a real spec has
dozens of operations. This tool ignores everything that cannot break a
client and classifies what remains.

## Why nothing is uploaded

An OpenAPI document can describe an unreleased API surface. Pasting it into
a third-party web tool just to answer "did anything break" is a real
information disclosure for a question that does not need one. Both files
stay in your browser; nothing is uploaded, and the tool makes no network
calls of its own — including no fetch of an external `$ref`.

## Try it without installing anything

[`index.html`](index.html) runs the same comparison logic in a browser page.
Paste the before and after OpenAPI JSON and get the breaking and
non-breaking changes.

## Quickstart (CLI)

```sh
python3 openapi_diff.py old.json new.json                    # human-readable
python3 openapi_diff.py old.json new.json --format json       # machine-readable
python3 openapi_diff.py old.json new.json --fail-on-breaking  # exit 2 only if a breaking change is found
```

Zero dependencies — stdlib only, one file, nothing to install, no network
calls. `--fail-on-breaking` only fails the build on an actual breaking
change, not on every routine addition, so it is safe to wire into a merge
gate on the spec file without generating noise on ordinary releases.

## Formats understood

OpenAPI **3.0.x** and **3.1.x** JSON documents only. A Swagger 2.0 document
is detected by its `swagger` field and explicitly rejected — its parameter
and body shape differ enough from OpenAPI 3 that silently trying to read it
the same way would misreport rather than just refuse. YAML is not parsed;
convert to JSON first with any OpenAPI tool's own export or a YAML-to-JSON
converter.

## $ref resolution

Local `#/...` JSON Pointer refs are resolved, including refs inside
`components.parameters`, `components.requestBodies`, and path items
themselves — the common case for a spec that shares parameters across
operations. External refs (another file, a URL) are not fetched, since this
tool makes no network calls of any kind, and are treated as unresolved.

## What counts as breaking

- An operation (method + path) is removed.
- A parameter that did not exist, or was optional, becomes required.
- An existing parameter's declared `type` changes.
- An enum value is removed from a parameter's schema.
- A request body becomes required where it was previously optional or absent.

## Disclaimers

This tool answers one question: which parts of the API *contract* differ,
structurally, between two OpenAPI documents, and whether that difference
would break an existing client's request. It does **not** deep-diff request
or response body schemas beyond a request body's own `required` flag, and it
does not know your clients' actual behavior — a removal a client never
depended on is reported the same as one that would break every caller.
Verify its output before relying on it, the same as any free, best-effort
tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## How this compares

- [vs. manually reading the spec diff](vs-manually-reading-the-spec-diff.html) --
  why classifying breaking-vs-non-breaking beats scrolling a raw text diff.
- [vs. oasdiff](vs-oasdiff.html) -- oasdiff is an open-source Go CLI with 755
  documented change rules reaching into request/response body schemas and
  its own GitHub Action; this tool checks 12 of the most common
  operation/parameter/request-body changes, in a browser, with nothing to
  install.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`diff_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
a repository or an API spec. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing.

## Development

```sh
python3 -m unittest test_openapi_diff -v
node --test diff.test.mjs
node --test page.test.mjs
node --test usage.test.mjs
```

`diff.test.mjs` includes a parity test that shells out to `python3
openapi_diff.py` and asserts the browser port produces the same
breaking/non-breaking classification on the same fixture, so the CLI and the
page can never silently disagree about what would break a client.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). Not a scored pipeline
candidate — like
[`sbom-diff-check`](../sbom-diff-check/) and
[`sql-migration-lock-check`](../sql-migration-lock-check/), this is a direct
graduation of an already-obvious, low-risk dev-tool idea, following
`portfolio/pipeline/README.md`'s "archetype itself" guidance to weigh a
CLI/checker shape with a named channel over another `<trade>-bid-calculator`.
No external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
