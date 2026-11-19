---
kind: polish
topics: [privacy, seo, guardrails]
date: 2026-11-19
---
# Polish, 2026-11-19: the privacy scanner stops publishing placeholder hosts

Track: polish/0. PR #17561 (the draft was opened before the rebuild to claim the item). Picked item 1
of "Still weakest" in `polish-2026-11-19-about-one-list.md` ("Scanner false positives").
`polish_queue.py` showed 0 items claimed. The only open polish PR, #14012, is unrelated.

## What was wrong (measured on the main build, before the change)

`surfaceExternalFetchHosts` (`platform/pages/build.mjs`) reads each tool's shipped code for
off-origin requests and feeds the privacy copy: the tool page's "what you type here also goes to
…" line, /about/'s outside-services list, `llms.txt` and the share-card footer. It was reporting
hosts that no browser ever contacts:

- **`x`** on 25 tools. Self-hosted servers parse their own path with `new URL(req.url, "http://x")`.
  Six tool pages (changelog-keeper, error-keeper, sign-keeper, survey-keeper, testimonial-keeper,
  webhook-relay) told visitors: "what you type here also goes to x, because that is what checking
  it means".
- **`proxy.local`**: llm-spend-guard's proxy parse base. Its page said "also goes to proxy.local".
- **`h.example`** (shift-roster-builder, a test fixture) and **`www.w3.org`** (einvoice-preflight and
  shift-roster-builder: XML-DSig, XPath and SVG namespace identifiers such as
  `http://www.w3.org/2000/09/xmldsig#`, never requested).

/about/ listed 54 tools, and its "Between them they call …" line named all four.

## Checked before dropping (the report's own warning)

Seven tools would leave the exception list entirely and get the "runs in your browser" copy, so I
read each one's browser code in the built `dist/`:

| tool | page's browser modules | fetches |
|---|---|---|
| changelog-keeper | usage.mjs, store.mjs (+ admin `page.mjs`, `widget.mjs`) | same-origin path / the user's own server `base` |
| error-keeper | engine.mjs, usage.mjs (+ `browser-sdk.js`, `sdk.mjs`) | the user's own ingest endpoint |
| llm-spend-guard | guard.mjs, simulate.mjs, usage.mjs | none in the browser; `proxy.mjs`/`cli.mjs` run on the user's server |
| sign-keeper | usage.mjs (+ admin `page.mjs`) | same-origin `fetch(p)` |
| survey-keeper | survey.mjs, usage.mjs | none |
| testimonial-keeper | usage.mjs (+ `page.mjs`, `widget.mjs`) | same-origin / user's own server `base` |
| webhook-relay | relay.mjs, usage.mjs (+ `admin.mjs`) | same-origin; the server posts to receivers the user configures |

No module on any of these pages contacts a third party. Their servers are software the visitor
would deploy themselves.

## What changed

- `isPlaceholderHost(url)` (exported), applied after `PLAUSIBLE_HOST`. It drops single-label hosts
  other than `localhost`, the reserved TLDs `.example .test .invalid .localhost .local` (RFC 2606, 6761,
  6762), `example.com|net|org` and their subdomains, and `http://www.w3.org/…`. It keeps
  `localhost:*` and loopback IPs, because a tool that talks to Ollama really does send your text
  there, and https `www.w3.org`.
- `build.test.mjs`: one fixture moved from `cdn.example.com` to `cdn.widgetvendor.net` (it stood
  for a real CDN). Two new tests: a server file that has every placeholder shape plus one real
  `fetch` reports only `api.resend.com` and `localhost:11434`; and look-alikes (`examples.com`,
  `example.co.uk`, `https://www.w3.org/TR/`, `my.testing.org`) are kept.

## Measured (full rebuild, `dist/`)

| | before | after |
|---|---|---|
| tools on /about/'s outside-services list | 54 | 47 |
| placeholder hosts in /about/'s "Between them they call" line | 4 (`x`, `www.w3.org`, `proxy.local`, `h.example`) | 0 |
| tool pages saying "also goes to x" or "proxy.local" | 7 | 0 |
| `check.mjs` | publishable | publishable, 11,810 pages, no dead links |

## Still weakest, and what I would do next

1. **Over-disclosure that is real-shaped.** The catch-all rule (any `https://` literal in a file with a
   fetch call) still lists hosts a tool names but never calls in the browser: `marisstella.app` on
   shift-roster-builder (its own site), and `github.com` on several keepers (likely README or deploy
   links in server code). Each is true-ish, never false-negative, but a reader sees "your text goes to
   github.com". Scoping the catch-all to files the *page* loads (follow `import` from `index.html`) would
   separate browser requests from self-hosted server code, and is the next real gain.
2. **Server code vs. browser code.** The privacy line is about the visitor's browser. Seven tools
   now show "runs in your browser" because their only hits were placeholders, while tools like
   cancel-flow still list `api.stripe.com` purely from `server.mjs`. Same fix as item 1.
3. Carried over: grouping /about/'s list by kind (`about-one-list` item 3) is safer now that the
   placeholders are gone, but still needs item 1 first.
