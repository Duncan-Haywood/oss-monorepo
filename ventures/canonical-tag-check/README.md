# Canonical Tag Checker

A free tool for developers and SEO practitioners: fetches a URL you choose **for real**,
reads its `<link rel="canonical">` tag(s), and — when there is exactly one — fetches that
URL too, then classifies the evidence into the canonicalization mistakes that quietly tell
search engines to index the wrong page, or nothing at all:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/canonical-tag-check/

- **Multiple conflicting canonical tags** — two or more `<link rel="canonical">` tags naming
  different URLs. Browsers and search engines only honor the first one found and ignore the
  rest, so this is the page's own markup contradicting itself — commonly two systems (a CMS
  plugin and a hand-written template tag, say) both emitting one.
- **A relative canonical URL** — Google's own guidance is to use an absolute URL, since a
  relative one leaves the protocol and host to be inferred.
- **A protocol mismatch** — the canonical's scheme (`http`/`https`) doesn't match the page
  it's on, often a leftover from a migration.
- **A cross-domain canonical** — the canonical points at a different registrable domain. A
  real pattern for syndicated content, and also exactly what a hardcoded staging URL or a
  copy-pasted template leaves behind.
- **A canonical target that doesn't resolve** — the canonical URL 404s, errors, or redirects
  before reaching a usable page.
- **A canonical target that is itself marked `noindex`** — a direct contradiction: the tag
  says "index this page" while that exact page says "don't index me."

After using this, you can name the exact tag and fetch that proves a canonicalization issue
exists — instead of guessing from documentation or waiting for a ranking drop to notice it.

**Only point this at a system you own or are authorised to check.** It sends ordinary,
unauthenticated GET requests — nothing here bypasses authentication or reads protected data —
but treat it the same as you would `curl` or any other request tool aimed at someone else's
server.

## Two parts, sharing the same classification logic (`analyze.mjs`)

### CLI — does the actual fetching

```
node cli/check.mjs https://example.com/some/page [--json] [--timeout <ms>]
```

Fetches directly from your machine — nothing goes through this portfolio. Exit code `0` when
the page fetched successfully and no danger-severity finding was produced; `1` otherwise, so
it's usable directly as a CI gate against your own staging environment:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node cli/check.mjs https://staging.example.com/blog/some-post/
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node cli/check.mjs <url> --json`, and click Check.
**Why the browser can't do the fetching itself:** reading another origin's response headers
and body from inside a page is CORS-gated, and most sites set no
`Access-Control-Allow-Origin` at all — so a browser tab cannot reliably fetch an arbitrary
URL and read what came back, even a URL you own. Only a non-browser HTTP client (the CLI
here, `curl`, etc.) can do that. Nothing you paste is uploaded; the page reads it in memory
in your tab.

## What this is, and isn't

**Evidence, not a determination.** One or two real fetches, checking eight specific,
well-documented canonicalization patterns — not a full SEO audit and not a whole-site crawl.
It cannot see an issue outside what a canonical tag and its target page can show. A clean
report means these fetches found nothing, not that the page (or site) has no other SEO
issues.

**Real requests, real risk to be honest about.** This CLI sends actual network traffic to
whatever URL(s) it needs. Only run it against systems you own or are authorised to check.

**Not a replacement for a whole-site crawler.** If you need a full technical SEO audit
across an entire site, that's a different tool's job —
[`vs-screaming-frog.html`](vs-screaming-frog.html) sets out which question each one answers
and why the two compose rather than compete.

## Privacy

The CLI's requests go straight from your machine to the URL(s) it needs — never through this
site, and nothing about the target or the results is sent anywhere by this tool. The browser
page only parses JSON you paste into it locally. The only thing stored is an anonymous local
count (`localStorage`, browser only) of which features were used and the day — no target
URLs, no response headers, no account, no tracking cookies, no analytics vendor, honouring Do
Not Track and Global Privacy Control automatically. Turn it off with the checkbox in the page
footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It
is not SEO advice, and it does not replace a qualified SEO review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to
check any URL you point the CLI at. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be
slow, broken, moved, or taken offline without notice. The CLI has no such dependency — it's
a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes
what the tool does.

## Tests

```
cd ventures/canonical-tag-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the network layer against a
local loopback server so no test hits a real network (`probe.test.mjs`), the CLI's
orchestration and argument parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`),
and both pages' structure and disclaimers (`page.test.mjs`, `vs-screaming-frog.test.mjs`).
