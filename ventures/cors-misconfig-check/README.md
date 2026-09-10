# CORS Misconfiguration Checker

A free tool for API developers: sends **six real HTTP GET requests** to a URL
you choose, each with a different `Origin` header, and classifies the
responses into the CORS misconfiguration patterns that actually get exploited:

- **Reflects an unrelated origin** — `Access-Control-Allow-Origin` echoes back
  an origin with no relationship to the target at all, meaning no allow-list
  check is happening. Combined with `Access-Control-Allow-Credentials: true`,
  any website can read an authenticated response as a logged-in visitor.
- **Accepts `Origin: null`** — exploitable via a sandboxed iframe or a
  `data:` URI, which any attacker page can produce with no domain of its own.
- **Unanchored allow-list matching** — two classic bypass domains, one
  crafted to pass a naive `startsWith` check and one for a naive
  `endsWith`/`includes` check, the shapes documented in PortSwigger's Web
  Security Academy CORS material and the wider bug-bounty literature.

Plus two lower-severity notices: `Access-Control-Allow-Origin: *` combined
with `Access-Control-Allow-Credentials: true` (invalid per the Fetch spec;
modern browsers block it, but it signals a sloppy policy), and a dynamic
`Access-Control-Allow-Origin` with no `Vary: Origin` (a shared-cache risk).

That last notice is why there are six requests rather than five. Four carry
an origin an attacker could control, one carries no `Origin` header at all,
and the sixth carries **your own origin** — not an attack, and never a
finding on its own. It is there because the `Vary: Origin` notice is really
about the caching layer in front of the API rather than the allow-list
behind it: on a server whose allow-list *works*, all four attack origins are
correctly rejected, so nothing else in the run would ever show that the
response still changes with the request. The no-`Origin` request is what
tells a dynamic header from a static one — a value that is identical whether
or not you send an `Origin` is the same response for everybody, and owes no
`Vary`.

After using this, you can name the exact response header that proves a CORS
misconfiguration exists — instead of guessing from documentation or waiting
for a pentest or bug bounty report to find it first.

**Only point this at a system you own or are authorised to test.** It sends
ordinary, unauthenticated GET requests — nothing here bypasses
authentication or reads protected data — but treat it the same as you would
`curl` or any other request tool aimed at someone else's server.

## Two parts, sharing the same classification logic (`analyze.mjs`)

### CLI — does the actual probing

```
node check.mjs https://api.example.com/some/endpoint [--json] [--timeout <ms>]
```

Sends the six requests directly from your machine to the URL you name —
nothing goes through this portfolio. Exit code `0` when every probe completed
and no danger-severity finding was produced; `1` otherwise, so it's usable
directly as a CI gate against your own staging environment:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/api/health
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <url> --json`, and
click Check. **Why the browser can't do the probing itself:** `Origin` is a
forbidden request header under the WHATWG Fetch spec, so a browser tab can
never set it to anything but the page's own real origin — that restriction
is part of what CORS protects. Only a non-browser HTTP client (the CLI here,
`curl`, etc.) can send the crafted headers these probes depend on. Nothing
you paste is uploaded; the page reads it in memory in your tab.

## What this is, and isn't

**Evidence, not a determination.** Six specific requests testing four named
patterns — not a penetration test, not a full security assessment. It does
not send real credentials, does not test authenticated behaviour, and cannot
see a misconfiguration shape none of its six probes happens to trigger. A
clean report means these six requests found nothing, not that the API has
no CORS issues.

**Real requests, real risk to be honest about.** This CLI sends actual
network traffic to whatever URL you give it. Only run it against systems you
own or are authorised to test — the same rule that applies to any HTTP
client aimed at someone else's server.

**Not a replacement for a web security testing platform.** If you are
assessing a whole application interactively, that is a different tool's job —
[`vs-burp-suite.html`](vs-burp-suite.html) sets out which question each one
answers and why the two compose rather than compete.

## Privacy

The CLI's requests go straight from your machine to the target URL — never
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
cd ventures/cors-misconfig-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network
layer with an injected fake transport so no test hits a real network
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and both pages'
structure and disclaimers (`page.test.mjs`).
