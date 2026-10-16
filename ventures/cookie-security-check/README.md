# Cookie Security Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cookie-security-check/>

A free tool for web developers and security researchers: sends **one real HTTP
GET request** to a URL you choose and classifies the response's `Set-Cookie`
headers into the misconfiguration patterns that actually break things:

- **`SameSite=None` without `Secure`** — the current SameSite specification
  requires `Secure` alongside `SameSite=None`, and Chrome, Firefox, and Safari
  all reject the `Set-Cookie` header outright when it's missing, rather than
  merely restricting the cookie to same-site requests. The cookie is never
  stored at all.
- **A `__Host-` or `__Secure-` prefixed cookie that violates the attribute
  rules those prefixes require** — `__Secure-` requires `Secure`; `__Host-`
  requires `Secure`, no `Domain` attribute, and `Path=/`. Violate any one and
  a compliant browser silently refuses to store the cookie, the same
  silent-rejection shape as the SameSite case above.

Plus three lower-severity notices, each real but context-dependent rather than
an unconditional browser rejection: **missing `Secure`** on an HTTPS response,
**missing `HttpOnly`**, and **no `SameSite` attribute at all**.

The value here isn't reading three attribute names — `curl -I` does that.
It's two things a naive implementation gets wrong: getting the two
browser-rejection rules right (SameSite=None needing Secure; the
`__Host-`/`__Secure-` prefix contract) rather than only checking whether an
attribute is merely present, and reading `Set-Cookie` from Node's own
already-split header array instead of joining repeated headers into one
string and re-splitting on commas — which silently corrupts any cookie
carrying an `Expires` date (`Expires=Wed, 21 Oct 2026 07:28:00 GMT` has a
comma of its own). See
[`samesite-none-cookie-rejected.html`](samesite-none-cookie-rejected.html)
for the fuller explanation of why both "danger" patterns read as functional
bugs before they read as security ones.

This gap was named, not guessed at: [`../security-headers-check/README.md`](../security-headers-check/README.md)
explicitly lists cookie flags as out of scope for that checker. This tool is
the fill for that gap, not a duplicate of it.

**Only point this at a system you own or are authorised to test.** It sends
one ordinary, unauthenticated GET request — nothing here bypasses
authentication or reads protected data — but treat it the same as you would
`curl` or any other request tool aimed at someone else's server.

## Two parts, sharing the same classification logic (`analyze.mjs`)

### CLI — does the actual probing

```
node check.mjs https://example.com [--json] [--timeout <ms>]
```

Sends the request directly from your machine to the URL you name — nothing
goes through this portfolio. Exit code `0` when the probe completed and no
danger-severity finding was produced; `1` otherwise, so it's usable directly
as a CI gate against your own staging environment:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <url> --json`, and
click Check. Nothing you paste is uploaded; the page reads it in memory in
your tab.

## What this is, and isn't

**Evidence, not a determination.** One request, testing a specific,
well-documented set of `Set-Cookie` attribute patterns — not a penetration
test, not a full security assessment. It does not crawl other pages on the
site and cannot see a misconfiguration none of its checks happen to cover
(response security headers like CSP and X-Frame-Options are out of scope
here — see [`../security-headers-check/`](../security-headers-check/README.md)
for those). A clean report means this one request found nothing, not that
the site's cookies have no security issues.

**Real requests, real risk to be honest about.** This CLI sends actual
network traffic to whatever URL you give it. Only run it against systems you
own or are authorised to test — the same rule that applies to any HTTP
client aimed at someone else's server.

## Privacy

The CLI's request goes straight from your machine to the target URL — never
through this site, and nothing about the target or the results is sent
anywhere by this tool. The browser page only parses JSON you paste into it
locally. The only thing stored is an anonymous local count (`localStorage`,
browser only) of which features were used and the day — no target URLs, no
`Set-Cookie` values, no account, no tracking cookies, no analytics vendor,
honouring Do Not Track and Global Privacy Control automatically. Turn it off
with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review or penetration test. You are responsible for reviewing and
verifying its output before relying on it, and for having authorisation to
test any system you point the CLI at. To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from its
use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/cookie-security-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network
layer with a real local HTTP server so no test hits the outside network
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and both pages'
structure and disclaimers (`page.test.mjs`).
