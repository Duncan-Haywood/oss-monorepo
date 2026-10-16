# JWT Verification Misuse Check

A free tool that scans your own JavaScript/TypeScript, Python, Go and Java
source for the JWT mistakes that let an attacker forge a token your server will
trust. Each finding prints `file:line`, the risk and the exact fix.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/jwt-verification-misuse-check/

| Type | What it flags |
| --- | --- |
| `jwt-decode-without-verify` | `jwt.decode`, Go `ParseUnverified`, Java `JWT.decode`, python-jose `get_unverified_claims`: claims read, signature never checked |
| `jwt-verify-disabled` | PyJWT `options={"verify_signature": False}` or `verify=False` |
| `jwt-alg-none` | `none` accepted as an algorithm, Go `SigningMethodNone`, Java `Algorithm.none()` |
| `jwt-algorithms-not-pinned` | `jwt.verify` / `jwt.decode` / `jwt.Parse` with no `algorithms` option, so the token's own `alg` header decides |
| `jwt-expiry-disabled` | `ignoreExpiration: true`, `verify_exp: False`, Go `WithoutClaimsValidation` |
| `jwt-not-before-disabled` | `ignoreNotBefore: true`, `verify_nbf: False` |
| `jwt-hardcoded-secret` | a string literal as the signing or verification key |
| `jwt-weak-secret` | ...that is under 16 characters or a well-known placeholder (`secret`, `changeme`, `shhhhh`) |
| `jwt-user-controlled-key` | the key argument comes from `req.`, headers, query, body or params |

**What it is not:** a security audit, a data-flow analysis or a penetration
test. It is a heuristic line scan. It misses misuse split across functions or
built dynamically, flags some safe code (decoding a token to display a name is
legitimate), and cannot judge key management, token lifetime or revocation.
A clean scan means only that these patterns were not found.

## Try it without installing anything

[`index.html`](index.html) runs the same logic in a browser page. Paste one or
more source files and get every finding. Nothing is uploaded, and the page
makes no network requests. The guide
[`what-is-jwt-verification-misuse.html`](what-is-jwt-verification-misuse.html)
explains each pattern.

## Quickstart (CLI)

```sh
python3 check.py                  # scan source files under the current directory
python3 check.py src/ app.py      # scan specific directories or files
python3 check.py --format json    # machine-readable
python3 check.py --fail-on-risk   # exit 2 if any finding exists
```

Zero dependencies, stdlib only, one file, no network calls. It reads `.js`,
`.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.py`, `.go`, `.java` and `.kt` files and
skips `node_modules`, `vendor`, `.git`, `dist`, `build` and virtualenvs. A
comment on its own line is ignored. The tool prints the length of a hard-coded
secret, never its value (a well-known placeholder such as `secret` is named).

## Limits

Regex and balanced-parenthesis scanning only: no parsing, no imports, no
tracking of a value across variables. The Go and Java secret-literal rules apply
only to files that mention `jwt`. Options passed through a variable
(`jwt.verify(t, k, opts)`) are trusted rather than followed. The frontend
library `jwt-decode` is not flagged.

## Disclaimers

Free, best-effort, no warranty. Review each finding yourself and have a
qualified person look at authentication code that protects anything valuable.
Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what the tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events in `localStorage` only, never
transmitted. Do Not Track and Global Privacy Control are honoured, and a button
on the page turns it off. The CLI records nothing.

## Development

```sh
python3 -m unittest test_check -v
node --test classify.test.mjs page.test.mjs
```

`classify.test.mjs` includes a parity test that runs `check.py` over a fixture
directory and asserts the browser port produces identical findings.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). First visitor channel:
people searching "jwt.decode vs jwt.verify", "jwt alg none" and "pyjwt
verify_signature false".
