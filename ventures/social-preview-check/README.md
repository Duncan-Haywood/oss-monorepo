# Social Preview Checker

A free tool for developers, marketers, and content creators: fetches a page's
Open Graph and Twitter Card meta tags, fetches enough of its `og:image` /
`twitter:image` to read the **real pixel dimensions straight out of the
file's own header**, and classifies the result into the problems that
actually break a shared link's preview:

- **Missing `og:title` / `og:description` / preview image** — nothing for a
  platform to render.
- **A relative `og:image` URL** — the Open Graph protocol (ogp.me) requires
  it be absolute; a path like `/images/preview.png` is a silent failure on
  most crawlers, not a style nit.
- **An image below the platform's documented minimum size** — Facebook:
  200x200 minimum, 1200x630 recommended. Twitter/X's `summary_large_image`
  card: 300x157 minimum, 1200x628 recommended. Below the hard minimum, most
  crawlers render nothing rather than a smaller image.
- **The `twitter:image` (and `twitter:title`/`twitter:description`) →
  `og:image` fallback chain, applied correctly** — a page with no
  `twitter:image` is not necessarily broken on X, but IS broken if `og:image`
  is also missing, relative, or too small. This tool follows that chain
  instead of flagging a missing `twitter:image` as a problem on its own.
- **A missing `twitter:card`**, **a duplicated `og:*`/`twitter:*` tag** (a
  common CMS-plugin-versus-hand-written-tag collision), and an **`og:url`
  that doesn't match the page actually checked**.

After using this, you can name the exact tag or image-size problem breaking a
shared link — instead of guessing from a blank preview or waiting for someone
to screenshot it and ask why.

## Three parts

### CLI — does the actual fetching

```
node cli/check.mjs https://example.com/your-page [--json] [--timeout <ms>]
```

Sends a real GET to the page, then a real (partial, range-limited) GET to
whichever `og:image`/`twitter:image` URLs it finds — straight from your
machine, nothing goes through this portfolio. No redirect is followed
automatically; a 3xx response is reported as its own result so you always
know exactly which page the report describes. Exit code `0` when the probe
completed and no danger-severity finding was produced; `1` otherwise, so
it's usable as a pre-publish CI gate:

```yaml
# in your own CI, not this portfolio's -- your compute, your target
- run: node cli/check.mjs https://staging.example.com/new-post
```

### Browser report viewer — renders JSON you already have

Open `index.html`, paste the output of `node cli/check.mjs <url> --json`, and
click Check. Nothing you paste is uploaded; the page reads it in memory in
your tab.

### Browser bonus tool — checks any image URL's real size directly

The same page also has a standalone "check any image URL's dimensions" box.
Loading an `<img>` element (unlike fetching its bytes) is **not** subject to
CORS, so this works for a third-party image URL with no CLI step and no
upload — the image loads straight from its own host into your browser, and
the page reads `naturalWidth`/`naturalHeight`.

## What this is, and isn't

**Evidence, not a determination.** This checks a specific, documented set of
Open Graph and Twitter Card patterns from one page fetch — not a full SEO
audit, not a guarantee of how any individual platform will render the
result. Platforms cache aggressively, sometimes need a manual cache-refresh,
and can change rendering rules without notice. A clean report means this one
fetch found nothing, not a promise about every platform's preview today. See
[`social-preview-fallback-rules.html`](social-preview-fallback-rules.html)
for the size table and fix order.

## Privacy

The CLI's requests go straight from your machine to the URL you name and its
preview image — never through this site. The report viewer only parses JSON
you paste into it locally; the image-size tool only loads an image URL you
paste into it locally. Nothing is uploaded anywhere this tool controls. The
only thing stored is an anonymous local count (`localStorage`, browser only)
of which features were used and the day — no target URLs, no page content,
no image URLs, no account, no tracking cookies, no analytics vendor,
honouring Do Not Track and Global Privacy Control automatically. Turn it off
with the checkbox in the page footer.

## No warranty

This tool is provided free and as-is, without warranty of any kind, express
or implied. It is not marketing, SEO, or legal advice, and it does not
replace checking each platform's own preview tool before you rely on a link.
You are responsible for reviewing and verifying its output before relying on
it. To the maximum extent permitted by law, the authors accept no liability
for any loss or damage arising from its use.

**Best-effort hosting, no SLA.** The hosted browser page is free,
experimental, and may be slow, broken, moved, or taken offline without
notice. The CLI has no such dependency — it's a script you run yourself.

## License

[MIT](LICENSE). Free and open source —
[support](https://github.com/sponsors/Duncan-Haywood) is entirely optional
and never changes what the tool does.

## Tests

```
cd ventures/social-preview-check && node --test
```

Assertions across the meta-tag parser (`metatags.test.mjs`), the image-header
byte parser for PNG/JPEG/GIF/WebP (`imagesize.test.mjs`), the classification
logic (`analyze.test.mjs`), the network layer against a real local HTTP
server with no external network access (`probe.test.mjs`), the CLI's
orchestration and argument parsing (`check.test.mjs`), the usage counter
(`usage.test.mjs`), and both pages' structure and disclaimers
(`page.test.mjs`).
