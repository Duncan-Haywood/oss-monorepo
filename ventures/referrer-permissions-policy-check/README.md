# Referrer-Policy & Permissions-Policy Checker

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/referrer-permissions-policy-check/>

A free tool for web developers and security researchers: sends **one real
HTTP GET request** to a URL you choose and classifies its `Referrer-Policy`
and `Permissions-Policy` headers into the misconfiguration patterns that
actually matter:

- **`Referrer-Policy: unsafe-url`** — sends the document's full URL,
  including its path and query string, as the `Referer` header on every
  outbound request this page makes, including a request that downgrades
  from HTTPS to plain HTTP. A query string carrying a session token or any
  other sensitive value is then readable by every third-party resource the
  page loads and by anyone who can observe that HTTP request in transit.
- **A `Permissions-Policy` directive with a malformed allowlist** — the spec
  requires either the bare wildcard `*` or a parenthesised list of `self`,
  `src`, or double-quoted origins (`camera=(self)`,
  `geolocation=(self "https://example.com")`). A bare unparenthesised
  origin, an unquoted origin inside the parens, or unbalanced parentheses
  does not match that shape, and browsers do not all handle it the same way.
- **A wildcard allowlist on a sensitive feature** (`camera`, `microphone`,
  `geolocation`, `payment`, `usb`, `midi`, `serial`, `hid`, `bluetooth`,
  `display-capture`, `clipboard-read`, `clipboard-write`,
  `screen-wake-lock`) — grants that capability to every origin the document
  ever embeds as an iframe, not just the site's own origin.

Plus notices for a missing or unrecognised `Referrer-Policy` value, the
legacy `no-referrer-when-downgrade` value (weaker than the current browser
default), a missing `Permissions-Policy`, and reliance on the deprecated
`Feature-Policy` header with no `Permissions-Policy` set (every current
major browser ignores `Feature-Policy` entirely, so a site that only sends
it is enforcing nothing).

No sibling venture in this portfolio reads either header:
`security-headers-check` covers CSP and frame-ancestors,
`cookie-security-check` covers `Set-Cookie` attributes,
`cors-misconfig-check` covers a reflected `Origin`, and
`cache-control-check` covers HTTP caching headers.

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
well-documented set of `Referrer-Policy` and `Permissions-Policy`
patterns — not a full privacy or security audit. It does not crawl other
pages on the site and cannot see a misconfiguration none of its checks
happen to cover (Content-Security-Policy and frame-ancestors are out of
scope here — see [`../security-headers-check/`](../security-headers-check/README.md)
for those). A clean report means this one request found nothing, not that
the site's privacy posture is optimal.

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
or implied. It is not security or privacy advice, and it does not replace a
qualified review. You are responsible for reviewing and verifying its
output before relying on it, and for having authorisation to test any
system you point the CLI at. To the maximum extent permitted by law, the
authors accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. Do not use it as a system of record.

## Support

Free and open source under an [MIT licence](LICENSE).
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) support is
entirely optional and never changes what the tool does.
