# Redirect Chain Checker

A free tool that checks a URL's real HTTP redirect chain for the
misconfigurations that quietly cost ranking signal and page-load latency:

- **Redirect loop** — an earlier URL in the chain reappears later in it, so
  the chain never terminates.
- **Chain too long** — more hops than recommended (default: 1) before
  landing. [Google's own Search Central documentation on
  redirects](https://developers.google.com/search/docs/crawling-indexing/301-redirects)
  advises keeping a chain as short as possible, because search engines may
  not follow a very long one, and each hop adds a full network round trip
  for every visitor.
- **Protocol downgrade** — a hop redirects from HTTPS back to HTTP.
- **Temporary code for a permanent move** — a hop that looks like a
  same-path scheme or www normalization (the classic shape of a one-time
  site move) used a temporary status (302/303/307) instead of a permanent
  one (301/308), which delays ranking-signal consolidation onto the new URL.
- **Chain ends in an error** — the final hop is a 4xx or 5xx response.
- **Chain incomplete** — the last hop given is itself still a redirect, with
  nowhere further to go in the data provided.

After using this, you can **name the exact hop, and the exact reason, your
redirect chain is costing you crawl budget or ranking signal** — before it
costs the whole migration's SEO value, not just the one wrong rule.

## Two parts, sharing the same classification logic (`engine.mjs`)

### CLI — walks the real chain

```sh
node check.mjs https://example.com/old-page [--json] [--timeout <ms>] [--max-hops <n>] [--recommended-max-hops <n>]
```

Makes one real HTTP request per hop, following each `Location` header itself
rather than letting an HTTP client do it silently — directly from your
machine, nothing through this portfolio. Exit code `0` when the chain landed
with no finding; `1` when a danger-severity finding was produced, a hop's
request failed, or the chain was still redirecting when it ran out of hops:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/old-page
```

### Browser — works from a pasted hop list

Open [`index.html`](index.html) and paste the hops, one per line as
`<status> <url>` — read off your browser's DevTools Network panel (the
Status and Name columns, in the order the requests happened), or from a
`curl -sI` trace of each hop by hand. Every check runs entirely from the
pasted text; nothing you paste is uploaded.

## Why can't the browser follow the chain itself?

A browser tab's `fetch()` to a different origin, by default, follows the
whole chain silently and hides every intermediate hop and status code —
exactly the information this tool needs. Asking for `redirect: "manual"`
instead makes the response **opaque**, so JavaScript cannot read the status
or the `Location` header of even the first hop. Either way, a page running
in your browser cannot reliably inspect a cross-origin redirect chain. The
CLI has no such restriction, because it isn't a browser tab — it makes one
real request per hop and reads each response directly.

## What this is, and isn't

**Evidence, not a determination.** Specific, documented checks against
whatever chain was actually fetched or pasted — not a full technical-SEO
audit, not a crawl-budget guarantee, and not a ranking guarantee.

**Real requests, from your own machine.** The CLI's requests go directly to
the URL you name and to the `Location` header its own server sends back.
Nothing is proxied through this site.

**A different job from a raw chain inspector.** If you just want to see the
raw chain and headers for a URL, that is a viewer's job, not this one — see
[`vs-httpstatus-io.html`](vs-httpstatus-io.html) for how this compares to an
established free redirect inspector.

## Privacy

The CLI's requests go straight from your machine to the URL and the
`Location` headers it names — never through this site. The browser page
only parses text you paste; nothing is uploaded. The only thing stored is
an anonymous local count (`localStorage`, browser only) of which features
were used and the day — no URLs, no pasted hops, no findings, no account,
no tracking cookies, no analytics vendor, honouring Do Not Track and Global
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
cd ventures/redirect-chain-check && node --test
```

Assertions across the classification logic (`engine.test.mjs`, including
loop detection, chain-length, protocol-downgrade, temporary-vs-permanent
status, and the paste-format parser), the network layer with a local
loopback HTTP server so no test hits the real internet
(`fetch-chain.test.mjs`, including redirect handling, a never-follow
guarantee, and a hang-proof timeout), the CLI's orchestration
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and all three
pages' structure and disclaimers (`page.test.mjs`).
