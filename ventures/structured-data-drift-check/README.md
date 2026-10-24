# Structured Data Drift Check

A free tool that checks whether a page's JSON-LD structured data
(`FAQPage`, `HowTo`, `Article`/`BlogPosting`/`NewsArticle`, `Product`,
`LocalBusiness`/`Organization`, `Review`) actually appears, **word for
word, in that same page's own visible rendered text** — and, where it
doesn't, names exactly the character where the two texts part ways.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/structured-data-drift-check/

**What it is not:** an SEO audit, a compliance verdict, or advice of
record. It answers one narrow, deterministic question per claim — is this
exact string present in the page's rendered text — from the page itself,
with no model, no crawl, and no guessing.

After using this, you can now **catch a stale or fabricated FAQPage answer,
a HowTo step nobody rewrote after the copy changed, or a Product
description that drifted from the page's own headline, in the same review
where the edit happened**, which used to take **nobody noticing until
Google Search Console flagged the rich result as ineligible, or an AI
answer engine repeated the stale claim to someone who never saw the page.**

## Why this exists

Google's Search Central documentation for `FAQPage` and `HowTo`
specifically requires the markup to describe content that is visible to a
visitor on the page — content that exists only in structured data is not
eligible for the rich result it's meant to earn. AI answer engines go
further: they read a page's JSON-LD as a structured, pre-parsed statement
of what the page says, with no published rule requiring it to match what a
human sees. Either way, the failure mode is the same: someone edited the
visible copy and forgot the JSON-LD, or wrote the JSON-LD once and the
copy kept moving underneath it — nothing about how a page is normally
built keeps the two in sync, and no build step catches it unless something
checks.

This portfolio has already shipped that exact defect once: an earlier
product's FAQPage JSON-LD didn't match its own visible copy, caught only
because a portfolio-wide guard
([`platform/pages/faq-visible.test.mjs`](../../platform/pages/faq-visible.test.mjs))
happened to scan for it. That guard proves the technique works for one
schema type on this repo's own pages; this tool generalizes it to five
more, for any page on the web.

`structured-data-drift-check` is the single-page-self-consistency sibling
of this portfolio's other zero-dependency checkers: same deterministic,
no-network, no-verdict shape as
[`license-drift-check`](../license-drift-check/) and
[`npm-lifecycle-script-check`](../npm-lifecycle-script-check/), applied to
a page's own markup instead of two point-in-time dependency snapshots.

## Try it without installing anything

[`index.html`](index.html) parses HTML pasted into it entirely in the
browser. Paste a page's full source and it extracts every checkable
JSON-LD claim, compares each one to the page's own visible text, and shows
exactly where a mismatched claim diverges. No fetch happens from the page
itself, so nothing you paste ever leaves your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the local file(s) you
name — no network call, ever.

```sh
node cli.mjs check dist/index.html                # one page, human-readable
node cli.mjs check dist/index.html --json           # machine-readable
node cli.mjs check dist/**/*.html                    # every page a shell glob expands
find dist -name '*.html' | xargs node cli.mjs check  # or from a build's output tree
node cli.mjs check dist/index.html --strict           # also fail on malformed JSON-LD
```

Exits 1 if any claim on any file diverges from that page's own visible
text (or, with `--strict`, if any `application/ld+json` block fails to
parse). Exits 0 if every claim matches or a page has no checkable
structured data.

More, including wiring this into CI as a gate:
[the docs page](why-google-requires-structured-data-to-match-visible-text.html).

## What's checked, per schema type

| Type | Fields checked |
|---|---|
| `FAQPage` | `mainEntity[].name` (question), `mainEntity[].acceptedAnswer.text` (answer) |
| `HowTo` | `name`, `description`, `step[].name`, `step[].text` |
| `Article` / `BlogPosting` / `NewsArticle` | `headline`, `description` |
| `Product` | `name`, `description` |
| `LocalBusiness` / `Organization` (and common subtypes) | `name`, `description` |
| `Review` | `reviewBody`, `author.name` |

Only textual claims a visitor can read and verify by eye — never opaque
numeric or URL fields (`ratingValue`, `priceCurrency`, `image`, and so
on). A type is found anywhere in the JSON-LD tree (a top-level array,
`@graph`, or nested inside another node — a `Review` inside a `Product`'s
`review` field, an `FAQPage` as a `WebPage`'s `mainEntity`), so no
per-type nesting rule has to be hand-maintained.
`LocalBusiness`/`Organization` subtype coverage is a curated list of
common subtypes plus a suffix heuristic (types ending in `Business`,
`Organization`, or `Store`) — stated plainly as non-exhaustive rather than
presented as complete.

## Disclaimers

This tool reports whether a JSON-LD claim's exact text is present in the
page's own visible copy. It is **not an SEO audit, not a Search Console
substitute, and not a ranking guarantee** — a clean result means the two
texts agree, nothing more, and it makes no claim about rich-result
eligibility or search rankings. Verify by reading the actual page, and
Google's current documentation, before relying on it.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied
to the page you pasted. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The extraction and
divergence engine, CLI, and browser page are built and tested (the page's
own FAQPage JSON-LD is checked against its own visible text as part of the
test suite); no external user contact has happened yet — that is the
next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
