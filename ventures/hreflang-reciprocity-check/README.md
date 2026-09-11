# hreflang Reciprocity Check

A free tool that checks a page's `<link rel="alternate" hreflang="..."
href="...">` tags for the well-documented international-SEO
misconfigurations Google's own hreflang documentation names directly:

- **Missing reciprocal confirmation** — page A links to page B with
  hreflang, but page B does not link back to page A. Google's documentation
  says hreflang annotations must be reciprocal or they may be disregarded.
- **Invalid or malformed language/region codes** — checked against the full
  ISO 639-1 language list and ISO 3166-1 region list, distinguishing a
  genuine mistake (`en-uk` — invalid, because "UK" was never assigned an
  ISO 3166-1 code; the correct code is `en-GB`) from a merely
  non-canonical casing (`EN-us` instead of `en-US`, which BCP 47 treats as
  equivalent but Google documents a canonical form for).
- **Missing `x-default`** — recommended, per Google's documentation, when a
  page declares two or more real language/region variants.
- **Missing self-referencing hreflang** — a page that uses hreflang should
  list itself among its own alternates.
- **Duplicate/conflicting hreflang values** — the same code pointing at two
  different URLs (a real conflict) versus the same code pointing at the
  same URL twice (harmless redundancy).

After using this, you can now **name the exact page that broke your
hreflang set — and why — before Google's next crawl silently disregards the
annotation**, instead of finding out from a Search Console International
Targeting report weeks later with no page-level detail.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — fetches real pages

```sh
node check.mjs https://example.com/en/ [--json] [--timeout <ms>] [--max-alternates <n>]
```

Fetches the target page over real HTTP(S), reads its hreflang tags, then
fetches each alternate href those tags name (deduplicated, capped at 50 by
default) to check reciprocity — all directly from your machine, nothing
through this portfolio. Exit code `0` when every check that could run found
nothing wrong; `1` when a danger-severity finding was produced, the target
could not be fetched, or an alternate could not be fetched (unverified
reciprocity is reported as incomplete, never silently passed):

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/en/
```

### Browser — works from pasted HTML, with a best-effort automatic fetch

Open [`index.html`](index.html), paste a page's HTML, and optionally give
its own URL to unlock the self-reference and reciprocity checks. For each
alternate the page's own tags name, the page offers a "Try automatic fetch"
button — it works when the target happens to allow cross-origin reads, and
most ordinary sites won't (see "Why can't the browser just check this
itself?" below), so a "paste this page's HTML instead" fallback is always
available. Nothing you type or paste is uploaded; everything runs in your
tab.

## Why can't the browser just check this itself?

It tries to. A page's `fetch()` call to a different origin is allowed to
send the request, but the browser will only let the calling page **read**
the response if the target server sends an `Access-Control-Allow-Origin`
header naming this tool's origin (or `*`). Most ordinary websites do not
send that header to arbitrary third-party origins — there is no reason for
them to — so a cross-origin fetch from this page typically fails with an
opaque error, not because of anything wrong with the target page, but
because of the same origin-isolation protection that stops any website from
silently reading another site's pages on a visitor's behalf. This is a
different restriction from the one `cors-misconfig-check` in this portfolio
documents (that one is about a browser being unable to *set* the `Origin`
request header at all); here the request usually goes out fine, the
response just can't be read back. Either way, the CLI has no such
restriction, because it isn't a browser tab.

## What this is, and isn't

**Evidence, not a determination.** Five specific, documented checks against
whatever pages were actually fetched or pasted — not a full international-
SEO audit, not a Search Console substitute, and not a ranking guarantee. An
alternate that could not be fetched is reported as unverified, never as
confirmed-clean.

**Real requests, from your own machine or browser.** The CLI's requests go
directly to the target and its alternates. The browser's automatic-fetch
attempts go directly from your tab to the URL shown, same as opening it in
a new one. Nothing about either is proxied through this site.

**A different job from a generic crawler.** If you need to check hreflang
across an entire site at scale, that is a sitemap-crawling tool's job, not
this one — see [`vs-merkle-hreflang-tool.html`](vs-merkle-hreflang-tool.html)
for how this compares to an established single-URL hosted checker.

## Privacy

The CLI's requests go straight from your machine to the target and its
alternates — never through this site. The browser page only parses HTML
you paste or that its own automatic-fetch attempts happened to read back
directly into your tab; nothing is uploaded. The only thing stored is an
anonymous local count (`localStorage`, browser only) of which features were
used and the day — no URLs, no pasted HTML, no findings, no account, no
tracking cookies, no analytics vendor, honouring Do Not Track and Global
Privacy Control automatically. Turn it off with the checkbox in the page
footer.

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
cd ventures/hreflang-reciprocity-check && node --test
```

Assertions across the classification/validation logic (`engine.test.mjs`,
including the full ISO 639-1/ISO 3166-1 lookups and the `en-uk`→`en-GB`
special case), the network layer with a local loopback HTTP server so no
test hits the real internet (`fetch-page.test.mjs`, including redirect
handling, a byte cap, and a hang-proof timeout), the CLI's orchestration and
deduplication of repeated alternate hrefs (`check.test.mjs`), the usage
counter (`usage.test.mjs`), and all three pages' structure and disclaimers
(`page.test.mjs`).
