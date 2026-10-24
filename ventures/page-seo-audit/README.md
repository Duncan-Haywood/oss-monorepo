# Page SEO Audit

A free on-page SEO and AI-readiness audit. **Paste a page's HTML and get a score, the mistakes ranked by how much they
matter, and the fix for each.** Nothing is uploaded; the page makes no network calls.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/page-seo-audit/

After using this, you can **find the mechanical SEO mistakes on a page (missing or mis-sized title, no canonical, broken
JSON-LD, no alt text, content that only exists after JavaScript) and fix them in minutes**, without a paid crawler.

## What it checks

`noindex`; title and meta description presence and length; one `h1` and no skipped heading levels; canonical (present,
absolute); viewport and `lang`; Open Graph and `twitter:card`; JSON-LD that parses and has a `@type`; question headings
without `FAQPage` markup; image `alt` and `width`/`height`; duplicate `<title>` or canonical tags; relative `og:image`; JSON-LD missing `@context`; dead `href="#"` links; `nofollow`; an empty `h1`; `og:url` that disagrees with the canonical; an `hreflang` set that omits the page itself; meta-refresh redirects; vague link text ("click here"); and how much text is in the served HTML (a
JS-only shell is critical, since most AI assistants read raw HTML). The **AI-readiness** figure is six of those signals
as a percentage.

Scoring: 100 minus 20 per critical, 7 per warning, 2 per note.

## CLI

```
node cli.mjs audit https://example.com/
node cli.mjs audit dist/index.html --min-score 85 --json
```

Exit 0 ok, 1 below `--min-score`, 2 unreadable input. Zero dependencies, Node 18+.

## Limits

Reads one page's markup only. It cannot see rendering, speed, backlinks, rankings or content quality, so a perfect score is
not a ranking guarantee. Relative canonical URLs are flagged because engines expect absolute ones.

## Files

`analyze.mjs` (engine, shared by page and CLI), `cli.mjs`, `index.html`, `seo-checklist-for-a-single-page.html`,
`usage.mjs` (opt-out local counters), tests: `node --test ventures/page-seo-audit/`.

MIT licensed. Free; support via GitHub Sponsors is optional.
