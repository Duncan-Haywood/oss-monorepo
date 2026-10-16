# JSON to Types Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/json-to-types-generator/>

Paste JSON samples, get **TypeScript interfaces, Zod schemas, JSON Schema or Go structs**.
Several samples are merged, so fields missing from some become optional and fields that
are sometimes `null` become nullable. Integers stay integers until a decimal appears;
always-ISO dates, UUIDs, emails and URLs are recognised; identical nested shapes share one
type; ID-keyed objects become maps. Anything it had to guess is listed.

[`index.html`](index.html) runs in a browser; nothing is uploaded and the page makes no
network calls. [`how-to-type-an-api-response.html`](how-to-type-an-api-response.html) is
the guide to optional vs nullable and runtime validation.

After using this, you can paste a few API responses and have types that reflect what the
API really returns, which used to mean hand-writing interfaces and finding the optional
fields in production.

## CLI

```
node cli.mjs response.json                       # TypeScript
node cli.mjs a.json b.json c.json --style zod    # merge three samples
cat samples.ndjson | node cli.mjs --style go --name ApiResponse
```

Styles: `ts` (default), `zod`, `jsonschema`, `go`. Options: `--name`, `--readonly`.
Node 18+, no dependencies.

## Limits

Types describe the samples you give it, not the API's contract. Numbers beyond 2^53 lose
precision in `JSON.parse`. Union handling is simple (Go falls back to `interface{}`).
No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
