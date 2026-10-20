# Security Headers Checker

A free tool for web developers and security researchers: sends **one real HTTP
GET request** to a URL you choose and classifies the response's frame-
protection and Content-Security-Policy headers into the misconfiguration
patterns that actually get exploited:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/security-headers-check/

- **Missing clickjacking protection** — neither a CSP `frame-ancestors`
  directive nor `X-Frame-Options` is present, so any site on the web can
  frame the page and trick a visitor into clicking something they didn't
  mean to.
- **`X-Frame-Options: ALLOW-FROM` is ignored by current browsers** — every
  current major browser engine dropped support for the `ALLOW-FROM` value
  once CSP2's `frame-ancestors` shipped as its replacement. The header looks
  like protection in a raw dump and isn't, in any browser in real use today.
- **CSP `script-src` (or its `default-src` fallback) allows `'unsafe-inline'`
  with no nonce or hash to override it** — CSP2+ browsers ignore
  `'unsafe-inline'` whenever a nonce-/hash-source is also present, so this
  only fires when nothing is actually overriding it.
- **CSP allows a wildcard script source** (`*`, `http:`, `https:`, or `data:`
  as a bare token in the effective `script-src`) — permits loading script
  from any host on that scheme.

Plus two lower-severity notices: **CSP shipped only as `-Report-Only`** (violations
are reported, nothing is blocked) and **no `Strict-Transport-Security` on an
HTTPS response** (no protection against a downgrade on a visitor's next
visit). And one **missing-CSP** notice when neither CSP header is present at
all.

The value here isn't reading four header names — `curl -I` does that. It's
getting the CSP fallback rules right the way a developer who has to know them
by heart already does and a naive grep does not: `frame-ancestors` does
**not** inherit from `default-src` (it's a navigation directive, not a fetch
directive — the CSP spec excludes it from that fallback), while `script-src`
does. See
[`clickjacking-and-csp-frame-ancestors.html`](clickjacking-and-csp-frame-ancestors.html)
for the fuller explanation with a worked comparison table.

After using this, you can name the exact response header that proves a
clickjacking or CSP weakness exists — instead of guessing from documentation
or waiting for a pentest or bug bounty report to find it first.

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
well-documented set of frame-protection, CSP-strength, and HSTS patterns —
not a penetration test, not a full security assessment. It does not crawl
other pages on the site and cannot see a misconfiguration none of its checks
happen to cover (`Permissions-Policy`, cookie flags, and Subresource
Integrity are out of scope here — see
[`../sri-check/`](../sri-check/README.md) for that last one). A clean report
means this one request found nothing, not that the site has no
security-header issues.

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
response headers, no account, no tracking cookies, no analytics vendor,
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
cd ventures/security-headers-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network
layer with an injected fake transport so no test hits a real network
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and both pages'
structure and disclaimers (`page.test.mjs`).
