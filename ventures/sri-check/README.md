# Subresource Integrity (SRI) Checker & Hash Generator

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/sri-check/>

Two free tools sharing one classification engine (`sri.mjs`):

- **Hash generator** — paste a script or stylesheet's exact contents and get
  back the `integrity="sha384-..."` value to paste onto its `<script>` or
  `<link>` tag. Hashed entirely in your browser with the Web Crypto API;
  nothing is sent anywhere.
- **Page checker** — a Node CLI fetches a page and every `<script src>` /
  `<link rel="stylesheet" href>` tag it loads from a **different origin**,
  and reports:
  - a cross-origin tag with **no `integrity` attribute** at all;
  - an `integrity` attribute with **no `crossorigin` attribute** — per the
    Fetch spec, most browsers silently skip the integrity check on a
    cross-origin tag without one, so the tag looks protected and isn't;
  - a declared hash that **no longer matches** what the CDN serves right
    now — either the file changed since the tag was written (a browser will
    now refuse to load it, breaking the page) or the hash was wrong from
    the start.

After using this, you can name the exact tag and reason a page's
third-party script protection is missing or broken — instead of assuming
`integrity="..."` in the source means it's working.

## Two parts, sharing the same core (`sri.mjs`)

### CLI — does the actual fetching

```
node cli/check.mjs https://example.com/ [--json] [--timeout <ms>] [--no-fetch-assets]
```

Fetches the page, then re-fetches every cross-origin asset that declares an
`integrity` hash to verify it still matches. Runs from your machine, straight
to the URLs involved — nothing goes through this portfolio. Exit code `0`
when the page was reachable and no danger-severity finding was produced;
`1` otherwise, so it's usable as a CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node cli/check.mjs https://staging.example.com/
```

`--no-fetch-assets` skips the second round of requests (a large page, or a
quick syntax-only pass) and reports only what the tags themselves declare,
with no hash-drift check.

### Browser — hash generator (standalone) and report viewer

Open `index.html`. The hash generator needs no CLI at all — paste content,
get a hash. The page checker needs the CLI's output: `node cli/check.mjs <url>
--json`, pasted in. **Why the browser can't fetch the page itself:** reading
another site's response body from browser JavaScript is CORS-restricted, and
most pages you'd want to check do not opt your tab into reading their full
HTML. Nothing you paste is uploaded; the page reads it in memory in your tab.

## What this is, and isn't

**Evidence, not a determination.** Checks one specific, well-documented
protection — integrity hashes on cross-origin script/stylesheet tags — not a
full security assessment. It does not evaluate inline scripts, iframes,
images, fonts, or same-origin code, and cannot see a risk outside that scope.
A clean report means these tags carry a valid, matching hash, not that the
page has no supply-chain risk.

## Privacy

The hash generator hashes pasted content locally; nothing is sent anywhere.
The CLI's requests go straight from your machine to the page and asset URLs
it references — never through this site. The browser page only parses JSON
you paste into it. The only thing stored is an anonymous local count
(`localStorage`, browser only) of which features were used and the day — no
page URLs, no pasted content, no account, no tracking cookies, no analytics
vendor, honouring Do Not Track and Global Privacy Control automatically.
Turn it off with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not security advice, and it does not replace a qualified
security review. You are responsible for reviewing and verifying its output
before relying on it. To the maximum extent permitted by law, the authors
accept no liability for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/sri-check && node --test
```

Assertions across the shared hashing/classification core (`sri.test.mjs`),
the network layer against a local loopback server so no test hits a real
network (`probe.test.mjs`), the CLI's orchestration and argument parsing
(`check.test.mjs`), the usage counter (`usage.test.mjs`), both pages'
structure and disclaimers (`page.test.mjs`), and the two comparison pages
(`vs-srihash.test.mjs`, `vs-checking-tags-by-hand.test.mjs`).

## Related reading

- [vs. srihash.org](vs-srihash.html) — how this compares to the well-known
  single-purpose hash generator.
- [vs. checking tags by hand](vs-checking-tags-by-hand.html) — why reading a
  page's source for SRI protection misses the crossorigin pairing gap and
  hash drift, which need a real fetch to detect.
