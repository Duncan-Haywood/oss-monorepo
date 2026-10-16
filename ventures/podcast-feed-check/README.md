# Podcast Feed Validator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/podcast-feed-check/>

A free tool that checks a podcast's RSS 2.0 + iTunes/Podcast-namespace feed
against the specific, documented requirements that cause an episode to be
rejected by Apple Podcasts, dropped by a podcast app, or silently reappear
to subscribers as "new" when it isn't:

- **Missing required channel elements** — title, description (or
  `itunes:summary`), language, link, cover artwork (`itunes:image`), at
  least one `itunes:category`, and an `itunes:explicit` value.
- **`itunes:category` not on [Apple's documented top-level Podcasts category
  list](https://podcasters.apple.com/support/1691-apple-podcasts-categories)**
  — Apple's feed processor matches this string exactly.
- **`itunes:explicit` in a deprecated or invalid format** — Apple's current
  documented format is the literal boolean string `true` or `false`; older
  values (`yes`, `no`, `clean`, `explicit`) are deprecated.
- **A missing `atom:link rel="self"`** — recommended by the RSS Advisory
  Board so a podcast app can confirm it has the canonical feed URL after a
  host migration.
- **Per-episode issues** — a missing title, enclosure, or pubDate; an
  enclosure with no MIME type or an unrecognized one; a zero-length
  enclosure; an invalid `itunes:episodeType`.
- **A `pubDate` not in RFC 822 format** — the RSS 2.0 spec's required date
  format (`Wed, 02 Oct 2024 15:00:00 GMT`). A human-readable but non-RFC-822
  date (an ISO date, a locale string) is invalid RSS even though it looks
  like a date.
- **Duplicate `<guid>` values across items** — the documented cause of an
  episode disappearing from a podcast app or reappearing as unseen, because
  podcast apps use guid, not title or position, to decide whether a
  subscriber has already been shown an item.

After using this, you can **name the exact element or episode your feed
fails on, and why**, before a rejected Apple Podcasts submission or a
"why did my episode disappear" support message costs you the guesswork.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — fetches the real feed URL

```sh
node check.mjs https://example.com/feed.xml [--json] [--timeout <ms>]
```

Makes one real HTTP request to the feed URL, directly from your machine —
nothing through this portfolio. Exit code `0` when no danger-severity
finding was produced; `1` when the feed could not be fetched, or a
danger-severity finding was produced:

```yaml
# in your own CI or publish script, not this portfolio's -- your compute
- run: node check.mjs https://example.com/feed.xml
```

### Browser — works from pasted feed XML

Open [`index.html`](index.html) and paste your feed's RSS XML — from
"View Page Source" on the feed URL, "Save As", or `curl -s <feed-url>`.
Every check runs entirely from the pasted text; nothing you paste is
uploaded.

## Why can't the browser fetch the feed itself?

A browser page's `fetch()` to a different origin is blocked by CORS unless
that server explicitly opts in with an `Access-Control-Allow-Origin`
header. Most podcast hosts do not set this for arbitrary third-party pages
— a feed being publicly reachable does not mean its owner meant for any
website to read it client-side. Rather than fail silently for feeds that
don't opt in, the browser page always works from pasted XML. The CLI has
no such restriction because it isn't a browser tab — it makes one real
HTTP request directly to the feed URL you give it.

## What this is, and isn't

**Evidence, not a determination.** Specific, documented checks against
whatever feed XML was actually fetched or pasted — not a full Apple
Podcasts submission checklist, and not a guarantee any podcast platform
will accept or display your show.

**Real requests, from your own machine.** The CLI's request goes directly
to the feed URL you name. Nothing is proxied through this site.

**A different job from a general XML/RSS validator.** If you want to check
that your feed is well-formed, spec-conformant XML in the general RSS/Atom
sense, that's a different tool's job — see
[`vs-w3c-feed-validator.html`](vs-w3c-feed-validator.html) for how this
compares to the W3C Feed Validator.

## Privacy

The CLI's request goes straight from your machine to the feed URL you
name — never through this site. The browser page only parses text you
paste; nothing is uploaded. The only thing stored is an anonymous local
count (`localStorage`, browser only) of which features were used and the
day — no feed URLs, no pasted XML, no findings, no account, no tracking
cookies, no analytics vendor, honouring Do Not Track and Global Privacy
Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind,
express or implied. It is not legal or professional advice, and it does
not replace a qualified professional. You are responsible for reviewing
and verifying its output before relying on it. To the maximum extent
permitted by law, the authors accept no liability for any loss or damage
arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/podcast-feed-check && node --test
```

Assertions across the hand-rolled feed parser
(`feed-parser.test.mjs`, including nested `itunes:category` subcategories,
CDATA/entity decoding, and never leaking an item's `<title>` into the
channel's), the classification logic (`engine.test.mjs`, every check above
plus the danger/notice severity split), the network layer with a local
loopback HTTP server so no test hits the real internet
(`fetch-feed.test.mjs`, including redirect-following, a byte-size cap, and
a hang-proof timeout), the CLI's orchestration (`check.test.mjs`), the
usage counter (`usage.test.mjs`), and all three pages' structure and
disclaimers (`page.test.mjs`).
