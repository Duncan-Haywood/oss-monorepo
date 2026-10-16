# Source Map Leak Checker

A free tool for anyone shipping a JavaScript build to production: reads each script's own
trailing `sourceMappingURL` comment, fetches the map it points at (or decodes it, if it's an
inline `data:` URI), and names which scripts have a **publicly readable production source map** —
and whether that map embeds **full original source text** (`sourcesContent`) or only file/folder
paths.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/source-map-leak-check/

A source map is meant for a developer's own devtools session. Left reachable on a live production
deployment, it hands the same readable code to anyone who requests the URL — internal comments,
business logic, API paths only referenced by variable name in the minified bundle, and
occasionally a hardcoded value nobody meant to ship in readable form. See
[`how-source-maps-leak-in-production.html`](how-source-maps-leak-in-production.html) for the four
common causes and the fix for each.

**Only run this against a site you own or are authorised to test.** It never writes, submits, or
modifies anything on the target — every request is `GET` — but treat it the same as you would
`curl` aimed at someone else's server.

## Two ways to run it, sharing the same modules (`probe.mjs` + `analyze.mjs`)

### Browser — works when the target's CORS policy allows it

Open `index.html`, paste a page URL or a list of script URLs, click **Check this site**. Whether
this can complete depends on the target: most sites don't send permissive CORS headers on their
main HTML document, so a browser tab often cannot read a cross-origin page's HTML at all. Static
JS/CSS assets on many CDNs and static-site hosts are more often served with permissive CORS, so
pasting explicit script URLs has better odds than a bare page URL. Nothing is uploaded to us
either way: every request goes straight from your browser to the target.

### CLI — the one path guaranteed to complete

```
node check.mjs <page-url> [--json] [--timeout <ms>]
node check.mjs --script <js-url> [--script <js-url> ...] [--json]
```

Not run from a browser tab, so it is never subject to CORS. Exit code `0` when no script's source
map was found to be publicly exposed; `1` when at least one is exposed, or the page/some scripts
could not be checked. Wire it into your own deploy pipeline so a regression turns the build red
the day it ships:

```yaml
# in your own CI, not this portfolio's -- your site, your pipeline
- run: node check.mjs https://your-production-url.example/
```

## What this is, and isn't

**Evidence, not a determination.** One GET per script the page (or list you gave it) actually
loads, and one GET per referenced map — not a full security assessment. It does not check CSS
source maps, inline (non-external) scripts, or JS loaded by dynamic import after the initial page
load. A clean report means every script this run could reach had no map reference, or one that
was not readable at the time of the check — not that the site has no exposure anywhere.

**A blocked reference is reported separately from a clean script**, because they mean different
things: `clean` means no `sourceMappingURL` comment exists at all (the most common correctly
configured case); `blocked` means the comment survived into production but the file it points at
returns a clean 401/403/404 — a healthy, if untidy, outcome.

See [`vs-checking-devtools-by-hand.html`](vs-checking-devtools-by-hand.html) for how this compares
to the manual check most developers reach for first.

## Privacy

Every request goes straight from your browser (or your own machine, for the CLI) to the URL(s)
you name — never through this site, and nothing about the page, the scripts, or what came back is
sent anywhere by this tool. The only thing stored is an anonymous local count (`localStorage`,
browser only) of which features were used and the day — no page URLs, no script URLs, no source
code, no account, no tracking cookies, no analytics vendor, honouring Do Not Track and Global
Privacy Control automatically. Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express or implied. It is not
security advice, and it does not replace a qualified security review. You are responsible for
reviewing and verifying its output before relying on it, and for having authorisation to test any
site you point it at. To the maximum extent permitted by law, the authors accept no liability for
any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free, experimental, and may be slow,
broken, moved, or taken offline without notice. The CLI has no such dependency — it's a script you
run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional and never changes what
the tool does.

## Tests

```
cd ventures/source-map-leak-check && node --test
```

Assertions across the network layer with a local fake HTTP server so no test hits the real
internet (`probe.test.mjs`), the classification logic (`analyze.test.mjs`), the CLI's
orchestration and argument parsing (`check.test.mjs`), the usage counter (`usage.test.mjs`), and
the pages' structure and disclaimers (`page.test.mjs`).
