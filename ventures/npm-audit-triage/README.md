# npm Audit Triage

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/npm-audit-triage/>

`npm audit` lists every advisory in your dependency tree and cannot say whether
your code imports the vulnerable package. This tool takes `npm audit --json`
plus your source and ranks the findings by reachability:

| bucket | meaning |
| --- | --- |
| `imported` | runtime code imports/requires the vulnerable package |
| `via-imported` | runtime code imports a package that depends on it |
| `test-only` | only test or tooling files import it |
| `not-referenced` | nothing scanned imports it or a parent |

Score = severity weight x reachability weight, so a reachable high outranks an
unreachable critical.

[`index.html`](index.html) runs it in a browser: paste the audit JSON and source.
Nothing is uploaded and the page makes no network requests.
[`how-to-triage-npm-audit-findings.html`](how-to-triage-npm-audit-findings.html)
is the order of operations for acting on the result.

## CLI / CI gate

```
npm audit --json | node audit-triage.mjs - src
npm audit --json | node audit-triage.mjs - src lib --fail-on high   # exit 1 on a reachable high/critical
node audit-triage.mjs audit.json . --json
```

Exit 1 = a reachable finding at or above `--fail-on`; exit 2 = unreadable input.
Node 18+, no dependencies. Reads npm 7+ (`vulnerabilities`) and npm 6
(`advisories`) output. `node_modules`, `dist`, `build` and `.git` are skipped.

## Limits

A static text scan of `import`/`require`/`import()`/`export from`. It cannot see
computed requires, framework-by-convention loading, or whether the vulnerable
function is called. "Not imported" lowers urgency; it is not proof of safety.
Not a security audit or advice. No warranty.

## Tests

```
node --test
```

MIT licensed. Support is optional: <https://github.com/sponsors/Duncan-Haywood>.
