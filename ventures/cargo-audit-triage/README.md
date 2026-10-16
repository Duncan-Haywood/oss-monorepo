# cargo audit Triage

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cargo-audit-triage/>

`cargo audit` lists every RustSec advisory that matches `Cargo.lock`, mixing
vulnerabilities with unmaintained, unsound and yanked warnings, and it cannot
say whether your code uses the crate. This tool takes `cargo audit --json`
plus your Rust source and ranks the findings by reachability:

| bucket | meaning |
| --- | --- |
| `imported` | runtime code (`src/`) names the flagged crate |
| `test-only` | only `tests/`, `benches/`, `examples/` or `build.rs` name it |
| `not-referenced` | nothing scanned names it (it may still be a dependency of something that is) |

Real vulnerabilities rank above warnings; more advisories on one crate rank it
a little higher. Crate names are matched with `-` read as `_` (`serde-json` is
used as `serde_json`), and `use` declarations (including brace groups),
`extern crate` and `crate::path` expressions are read. Comments and string
literals are ignored.

[`index.html`](index.html) runs it in a browser: paste the audit JSON and source.
The CLI is zero-dependency Node 18+:

```
cargo audit --json | node cargo-audit-triage.mjs - src
cargo audit --json | node cargo-audit-triage.mjs - src --fail-on-imported   # exit 1 if a used crate has a vulnerability
node cargo-audit-triage.mjs audit.json src crates --json
```

It is a static text scan, not a security audit. It cannot see macro-generated
paths, renamed dependencies, feature-gated code or whether the vulnerable
function is called, and "not referenced" is not "safe". Nothing is uploaded.
Sibling of [pip-audit-triage](../pip-audit-triage/) and [npm-audit-triage](../npm-audit-triage/).
