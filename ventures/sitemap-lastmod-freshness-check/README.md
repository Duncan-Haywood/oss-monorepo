# Sitemap lastmod Freshness Check

A free tool that checks a `sitemap.xml`'s `<lastmod>` dates for the
well-documented "freshness faking" anti-pattern Google's own sitemap
documentation names directly:

- **Invalid or malformed format** — the sitemap protocol requires a full
  [W3C Datetime](https://www.sitemaps.org/protocol.html) (a bare date, or a
  full date-time with an explicit timezone). Checked for calendar validity
  too, so `2026-02-30` is flagged rather than silently rolled over to March 1
  the way `Date.parse` would treat it.
- **Future-dated `<lastmod>`** — a page cannot have been modified in the
  future; this is always a clock/timezone bug or an unreplaced placeholder.
- **Duplicate `<loc>` entries with conflicting `<lastmod>`** — the same URL
  listed twice with two different dates, which nothing consuming the
  sitemap can resolve on your behalf.
- **A suspiciously uniform `<lastmod>`** — a large share of every URL in the
  sitemap sharing the exact same date. Google's documentation says
  `<lastmod>` should reflect a real, significant content change, and that it
  may stop trusting a site's `<lastmod>` values if they consistently don't
  hold up. Reported as a statistical signal (with the share and count named),
  not a certainty — a genuine one-time site migration produces the same
  shape.
- **A live-server mismatch** *(CLI only)* — whether the page's own real HTTP
  `Last-Modified` response header actually confirms a change as recent as
  the sitemap claims.

After using this, you can **name the exact URL, and the exact reason, your
sitemap's freshness signal might already be getting discounted** — before it
costs your whole site's crawl-prioritization signal, not just the one wrong
entry.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — fetches real pages

```sh
node check.mjs https://example.com/sitemap.xml [--json] [--timeout <ms>] [--max-urls <n>] [--uniform-threshold <0-1>] [--uniform-min-count <n>]
```

Fetches the sitemap over real HTTP(S), reads every `<loc>`/`<lastmod>` pair,
then reads (**headers only, never the page body**) each URL's live response
to check whether its own `Last-Modified` header confirms the sitemap's
claim — all directly from your machine, nothing through this portfolio. Exit
code `0` when every check that could run found nothing wrong; `1` when a
danger-severity finding was produced, the sitemap could not be fetched, or a
URL's live headers could not be fetched (unverified is reported as
incomplete, never silently passed):

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/sitemap.xml
```

### Browser — works from pasted sitemap XML

Open [`index.html`](index.html) and paste your `sitemap.xml`'s contents. Every
check except the live-server cross-check runs entirely from the pasted text —
format validity, future-dating, duplicate-conflict detection, and the
uniform-pattern signal all need nothing but the sitemap itself. Nothing you
paste is uploaded; everything runs in your tab.

## Why can't the browser check the live pages too?

A page's `fetch()` to a different origin either fails outright (in the
default `cors` mode, if the target doesn't send an
`Access-Control-Allow-Origin` header naming this tool's origin) or succeeds
as an **opaque** response (in `no-cors` mode) whose headers — including
`Last-Modified` — cannot be read by JavaScript at all, by design. Either way,
this page cannot reliably read a cross-origin page's own response headers
unless that page's server opts in, which ordinary third-party sites have no
reason to do. This is a different restriction from the one
`hreflang-reciprocity-check` in this portfolio documents (that one is about
a browser being unable to *read* a fetched response *body*; here even a
"successful" no-cors request hides every header). Either way, the CLI has no
such restriction, because it isn't a browser tab.

## What this is, and isn't

**Evidence, not a determination.** Specific, documented checks against
whatever sitemap and pages were actually fetched or pasted — not a full
technical-SEO audit, not a crawl-budget guarantee, and not a ranking
guarantee. A URL whose live headers could not be fetched is reported as
unverified, never as confirmed-clean.

**Real requests, from your own machine.** The CLI's requests go directly to
the sitemap and the URLs it names. Nothing about either is proxied through
this site.

**A different job from a schema validator.** If you need to check whether
your sitemap's XML itself is well-formed, that is a schema validator's job,
not this one — see
[`vs-xml-sitemaps-validator.html`](vs-xml-sitemaps-validator.html) for how
this compares to an established free sitemap validator.

## Privacy

The CLI's requests go straight from your machine to the sitemap and its URLs
— never through this site. The browser page only parses XML you paste;
nothing is uploaded. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no
URLs, no pasted XML, no findings, no account, no tracking cookies, no
analytics vendor, honouring Do Not Track and Global Privacy Control
automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not SEO, legal, or marketing advice, and it does not
replace a qualified professional. You are responsible for reviewing and
verifying its output before relying on it. To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/sitemap-lastmod-freshness-check && node --test
```

Assertions across the classification/validation logic (`engine.test.mjs`,
including W3C-Datetime format/calendar validation and the uniform-pattern
statistic), the network layer with a local loopback HTTP server so no test
hits the real internet (`fetch-url.test.mjs`, including redirect handling, a
byte cap, a header-only-never-body read, and a hang-proof timeout), the
CLI's orchestration and deduplication of repeated `<loc>` entries
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and all three
pages' structure and disclaimers (`page.test.mjs`).
