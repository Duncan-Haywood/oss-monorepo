# PWA Installability Checker

A free tool for web developers: fetches a page you choose, its linked **Web
App Manifest**, and every icon that manifest lists, then classifies the
result against **Chrome's documented installability criteria** — the same
checks behind Lighthouse's `installable-manifest` audit, with no Chrome or
Puppeteer required:

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/pwa-installability-check/

- **Manifest present and reachable** — a `<link rel="manifest">` tag exists
  and points at a URL that returns valid JSON.
- **Named** — `name` or `short_name` is set.
- **Installable display mode** — `display` is `standalone`, `fullscreen`, or
  `minimal-ui`. A missing field defaults to `browser` per spec, which fails
  this check the same way it fails Chrome's.
- **Secure origin** — the page is served over HTTPS (or `localhost`).
- **A large-enough icon that actually loads** — at least one icon of
  192x192 or larger (or `sizes: "any"`), fetched and confirmed to respond as
  an image.

Plus three lower-severity notices that never block installability on their
own: no icon at least 512x512 (used for a richer install/splash UI when
present), no explicit `start_url` (defaults to the manifest's own document
URL), and no `theme_color`/`background_color` (cosmetic only).

After using this, you get a plain-English list of exactly which criterion
failed and why — instead of installing Chrome DevTools, running Lighthouse,
or guessing from the spec.

## Two parts, sharing the same classification logic (`analyze.mjs`)

### CLI — does the actual fetching

```
node check.mjs https://example.com/ [--json] [--timeout <ms>]
```

Fetches directly from your machine — nothing goes through this portfolio.
Exit code `0` when the page is installable by these checks; `1` otherwise,
so it's usable directly as a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node check.mjs https://staging.example.com/
```

### Browser — renders a report from JSON you already have

Open `index.html`, paste the output of `node check.mjs <url> --json`, and
click Check. **Why the browser can't do the fetching itself:** this page is
hosted on its own domain, and fetching an arbitrary third-party page and
manifest from inside a browser tab is a cross-origin request that fails
unless that site's own server opts in with an `Access-Control-Allow-Origin`
header — almost none do for their HTML page or `manifest.json`. Only a
non-browser HTTP client (this CLI, curl, Lighthouse's own Chrome instance)
can fetch those directly. Nothing you paste is uploaded; the page reads it
in memory in your tab.

## What this is, and isn't

**Evidence, not a determination.** A specific, documented checklist — not a
full Lighthouse run. Lighthouse also scores performance, accessibility,
SEO, and checks like an offline-capable service worker that this tool does
not attempt. A clean report means these checks found nothing, not that
every browser will prompt to install the page. See
[`vs-lighthouse.html`](vs-lighthouse.html) for the full comparison — what
each tool covers, and why this one needs no Chrome or Puppeteer install.

**Real requests, real risk to be honest about.** This CLI sends actual
network traffic to whatever URL you give it, plus its manifest and icon
links. Only run it against pages you're authorised to probe — the same
rule that applies to any HTTP client aimed at someone else's server.

## Privacy

The CLI's requests go straight from your machine to the target URL (and
whatever that page's own manifest and icons point at) — never through this
site, and nothing about the target or the results is sent anywhere by this
tool. The browser page only parses JSON you paste into it locally. The
only thing stored is an anonymous local count (`localStorage`, browser
only) of which features were used and the day — no target URLs, no
manifest contents, no account, no tracking cookies, no analytics vendor,
honouring Do Not Track and Global Privacy Control automatically. Turn it
off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not engineering advice, and it does not replace testing
the actual install prompt in a real browser. You are responsible for
reviewing and verifying its output before relying on it. To the maximum
extent permitted by law, the authors accept no liability for any loss or
damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/pwa-installability-check && node --test
```

Assertions across the classification logic (`analyze.test.mjs`), the
network layer with an injected fake `fetch` so no test hits a real network
(`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), and the page's
structure and disclaimers (`page.test.mjs`).
