# Helm Values Schema Check

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/helm-values-schema-check/>

A free tool that validates a Helm chart's `values.yaml` against its own
`values.schema.json` (the JSON Schema format Helm itself has supported since
3.5) without running Helm at all.

**What it catches that `helm lint` usually doesn't:** a field `values.yaml`
sets that the schema never declares. Helm's Go template engine returns the
zero value for an undefined map key rather than erroring, so a typo like
`repositry:` instead of `repository:` renders quietly — and `helm lint`
enforces `additionalProperties: false` only if the schema author set it,
which most real charts' schemas do not. See
[the docs page](why-helm-silently-accepts-a-typo-in-values-yaml.html) for the
full mechanism.

**What it is not:** a replacement for `helm lint` or `helm template` — it
does not read chart templates, `Chart.yaml`, or subchart dependencies, and a
values file that matches its schema perfectly can still render a broken
chart for reasons entirely outside `values.yaml`. It is also not a full JSON
Schema implementation — see [Scope](#scope) below.

## Why this exists

A schema author writes `values.schema.json` once, usually without setting
`additionalProperties: false` (JSON Schema's default is permissive). From
that point, a values.yaml key that doesn't match anything in the schema is
not a schema violation — it's just an extra field, silently ignored by
`helm lint` and silently returning nothing wherever the chart's templates
read the correctly-spelled key instead. The mistake surfaces later, if at
all, as "why is it running the wrong image" days after the values file was
reviewed.

[`vs-helm-lint.html`](vs-helm-lint.html) covers where each tool's coverage
stops in detail — short version, they overlap but are not the same check,
and this one is narrower with no Helm install required.

## Try it without installing anything

[`index.html`](index.html) reads `values.yaml` and `values.schema.json` you
load or paste entirely in the browser and reports every mismatch. No fetch
happens from the page itself, so nothing you load ever leaves your device.

## Quickstart (CLI)

Zero dependencies, two files, Node 18+. Reads only the local files you name —
no network call, ever.

```sh
node cli.mjs check chart/values.yaml chart/values.schema.json               # exit 1 on any real schema violation
node cli.mjs check chart/values.yaml chart/values.schema.json --strict      # also fail on undeclared fields
node cli.mjs check chart/values.yaml chart/values.schema.json --json
```

Wire it into CI right before packaging a chart release:

```yaml
- name: Check values.yaml against its own schema
  run: node cli.mjs check chart/values.yaml chart/values.schema.json --strict
```

## Scope

Understood JSON Schema keywords: `type`, `properties`, `required`,
`additionalProperties`, `enum`, `minimum`, `maximum`, and `items` for
arrays — the subset that covers the overwhelming majority of real Helm
`values.schema.json` files. Not evaluated: `$ref`, `oneOf`/`anyOf`/`allOf`,
and regex `pattern` — a schema using them is read without error, but those
specific rules are not checked.

YAML support (see [`yaml.mjs`](yaml.mjs), adapted from
[`actions-minutes-estimator`](../actions-minutes-estimator/workflow-yaml.mjs)'s
parser): block mappings and sequences, flow collections, quoted and bare
scalars, comments, and block scalars. Not supported, and refused rather than
guessed: anchors/aliases and merge keys — rare in a `values.yaml`, and
silently mis-reading one would report a field as missing or mistyped that is
neither.

## Disclaimers

This tool reports mismatches against the JSON Schema subset it supports, for
the two files you supplied. It is **not** infrastructure, security, or
compliance advice, and a clean report does not guarantee the chart renders
correctly — only that `values.yaml` matches its own declared schema as far
as this tool checks it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `file_loaded`) in `localStorage` only — never transmitted,
never tied to your values or schema. Do Not Track and Global Privacy Control
are honoured, and a button on the page turns it off entirely. The CLI
records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checking engine,
CLI, and browser page are built and tested; no external user contact has
happened yet — that is the next, non-code step (see `kill_criteria` in
`VENTURE.yaml`).
