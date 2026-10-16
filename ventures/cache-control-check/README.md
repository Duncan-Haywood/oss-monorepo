# Cache-Control Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/cache-control-check/>

A free tool for web developers and performance engineers: sends **one real
HTTP GET request** to a URL you choose and classifies its caching headers
into the misconfiguration patterns that actually break things:

- **`Vary: *`** — RFC 9111 defines this as meaning the response is never
  reusable from cache, by any HTTP/1.1-compliant cache (browser or CDN),
  for any later request. It silently overrides any `Cache-Control` or
  `Expires` header aimed at making the response cacheable.
- **`Cache-Control: public` alongside a `Set-Cookie` header** — `public`
  tells every shared cache between the server and the visitor that it may
  store this response and serve it to a different visitor. If the response
  also sets a cookie meant for the one visitor who received it, a shared
  cache not specifically configured to strip `Set-Cookie` on write can hand
  one visitor's session cookie to the next.

Plus five lower-severity notices, each real but context-dependent rather
than an unconditional cache-breaking fact: `no-store` alongside a
now-meaningless `max-age`, `Expires` silently overridden by
`Cache-Control`'s `max-age`, an `Expires` value already at or before the
response's own `Date` header, a **weak `ETag`** on a response that
advertises byte-range support (RFC 9110 requires a *strong* validator for a
conditional `Range` request), and a static-asset-shaped path with no
caching headers at all.

The value here isn't reading a `Cache-Control` header — `curl -I` does
that. It's naming the handful of caching patterns that are genuinely
well-documented protocol facts rather than style preferences, and getting
the RFC details right: `Vary: *`'s "never cacheable" contract, the
`public` + `Set-Cookie` shared-cache leak, and which validator strength a
range request actually requires.

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
- run: node check.mjs https://staging.example.com/assets/app.js
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <url> --json`, and
click Check. Nothing you paste is uploaded; the page reads it in memory in
your tab.

## What this is, and isn't

**Evidence, not a determination.** One request, testing a specific,
well-documented set of caching-header patterns — not a full caching or
performance audit. It does not crawl other pages on the site and cannot see
a misconfiguration none of its checks happen to cover (response security
headers like CSP and X-Frame-Options are out of scope here — see
[`../security-headers-check/`](../security-headers-check/README.md) for
those, and [`../cookie-security-check/`](../cookie-security-check/README.md)
for `Set-Cookie` attribute patterns). A clean report means this one request
found nothing, not that the site's caching strategy is optimal.

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
header values, no account, no tracking cookies, no analytics vendor,
honouring Do Not Track and Global Privacy Control automatically. Turn it off
with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not performance or security advice, and it does not
replace a qualified review. You are responsible for reviewing and verifying
its output before relying on it, and for having authorisation to test any
system you point the CLI at. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. Do not use it as a system of record.

## Support

Free and open source under an [MIT licence](LICENSE).
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support is
entirely optional and never changes what the tool does.
