# Polish 2026-10-29: whole-site structural scan, and what is still weakest

**What I did.** Built the site (`node platform/pages/build.mjs`, 3,490 `index.html`) and scanned every
page for the defects an SEO pass usually finds, then screenshotted the hub and the AI Bookkeeper page at
390 px and 1280 px. No code changed: nothing below was a defect worth a fix.

## Measured (built site, 2026-10-29)

| Check | Result |
| --- | --- |
| Pages with no `<title>` / duplicate `<title>` | 0 / 0 |
| Pages with no meta description / duplicate description | 0 / 0 |
| Pages with no `og:image`, viewport, or `lang` | 0 |
| Pages with not exactly one `<h1>` (script bodies excluded) | 0 |
| `<img>` without `alt` | 0 |
| Pages with no canonical | 2: `/lab/` and `/lab/handoff/`, both deliberately `noindex` |

False alarms worth knowing: a naive `<h1>` count flags `affiliate-disclosure-checker` because its example
HTML lives in a JS template string; strip `<script>` first. Meta descriptions over 170 characters are
common (485 of the first 532 pages) but `clampMetaDescription` caps them at 320 on purpose, so I left it.

## Seen in screenshots

- Hub at phone width is strong: clear h1, search above the fold, stat tiles.
- AI Bookkeeper at phone width: three-line breadcrumb, then about 600 px of dense paragraph before any
  action. No "Open the tool" button is visible on the first screen. This is the weakest first-screen
  surface I saw; a primary call-to-action under the h1 and a shorter breadcrumb (current page title
  truncated) would help. The floating mic button also overlaps body text.

## Next run

1. First-screen call-to-action on flagship venture pages at 390 px (start with `ai-bookkeeper`).
2. Truncate the breadcrumb's last crumb to one line on phones.
3. Lighthouse was not run; traffic and ranking are unmeasured.

Tooling: the build takes about 20 minutes here; start it with `run_in_background` and poll its log.
