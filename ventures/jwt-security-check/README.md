# JWT Security Check

A free tool that decodes a pasted JSON Web Token — the `header.payload.
signature` format used across nearly every modern web and mobile
authentication system — and checks its header and payload for the common,
documented misconfiguration patterns: `alg: none`, embedded or referenced key
material (`jwk`/`jku`/`x5u`/`x5c`), a symmetric algorithm alongside an
asymmetric-key hint (algorithm confusion), a `kid` header shaped like path
traversal or SQL injection, missing or excessive expiration/issued-at/
not-before claims, and sensitive-looking field names in the (unencrypted)
payload.

After using this, you can now **spot the JWT misconfigurations that read as
perfectly ordinary JSON to a human reviewer**, which used to mean knowing the
whole documented failure list by heart and checking for each one by hand.

**What it is not:** a signature verifier, a security audit of your server's
verification code, or a claim that a token or the service issuing/verifying
it is secure. It never asks for a key and never contacts a network — it only
decodes the base64url header and payload (no key needed for that) and
pattern-matches them against a fixed, documented list. A finding is something
worth a look, not a verdict; a clean result is not a guarantee either,
only that none of this tool's checks fired.

## Why this exists

A JWT's header and payload are base64url-*encoded*, not encrypted — anyone
who has the token can decode and read them with no key at all. That is by
design (RFC 7519), and it is also why several real, well-documented
misconfigurations look like completely ordinary JSON once decoded: `"alg":
"none"` is a spec-legal value, an embedded `jwk` decodes to well-formed key
JSON, and a `kid` shaped like `../../etc/passwd` is just a string. None of
them look wrong to a reviewer scanning the decoded claims for whether the
*values* make sense — recognizing them requires knowing the specific,
documented shape to check for. This tool runs that checklist mechanically
every time, instead of relying on a reviewer to remember it.

## What gets flagged

- **`alg: none` or a missing `alg`** — a token asserting it is explicitly
  unsigned, or carrying no algorithm at all. A verifier accepting either
  skips signature verification.
- **Embedded/referenced key material** (`jwk`, `jku`, `x5u`, `x5c`) — a
  verifier that trusts one of these from the token itself, rather than only
  its own configured key store, is exposed to a documented header-injection
  forgery.
- **Algorithm-confusion risk** — a symmetric algorithm (`HS256`/`HS384`/
  `HS512`) alongside a header field normally associated with an asymmetric
  key, the shape of the documented "algorithm confusion" attack.
- **A `kid` shaped like path traversal or SQL injection** — `kid` is meant to
  be an opaque identifier; a verifier that uses it to build a file path or a
  database query without sanitizing it is a documented attack surface.
- **Timing-claim problems** — missing or already-past `exp`, an excessively
  long lifetime, a missing or future-dated `iat`, a still-future `nbf`.
- **Missing `aud`/`iss`** — no audience or issuer restriction recorded.
- **Sensitive-looking payload field names** — a reminder that the payload is
  readable by anyone who has the token, not just the server.

**On every heuristic above:** these are pattern-matching signals against
documented failure shapes, not a semantic understanding of your token or a
view into your server's verification code. A finding names a real, checkable
pattern in the text you pasted; whether it is actually exploitable depends on
code this tool cannot see, and every finding says so.

## Try it without installing anything

[`index.html`](index.html) runs the exact same logic as [`calc.mjs`](calc.mjs)
entirely in the browser. Paste your token, or load the built-in example, and
see the decoded header/payload plus every finding immediately — nothing is
uploaded, and the page makes no network requests.

```sh
cd ventures/jwt-security-check
node --test
```

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It is not a security audit, it does not verify
signatures, and it does not replace reviewing your own verification code.
**You are responsible for reviewing and verifying its output before relying
on it**, and for meeting any obligation it helps you prepare for. To the
maximum extent permitted by law, the authors accept no liability for any
loss or damage arising from its use.

**Privacy.** Everything runs client-side in your browser. The token you
paste, its decoded contents, and every finding this tool produces never
leave your device — there is no upload, no server-side processing, and no
third-party analytics vendor. Usage logging is opt-in, stays in
`localStorage` on your device, and records only that a check ran or a
summary was copied — never the pasted token or the findings themselves. Do
Not Track and Global Privacy Control disable it automatically.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, export your
inputs and run it yourself.

[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) is optional
and does not change what the tool does.
