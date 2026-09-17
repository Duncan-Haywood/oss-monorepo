# Merchant Feed Check

A free tool that checks a Google Merchant Center / Meta Catalog product feed
(CSV, TSV, or JSON) against the published product-data specification, and
reports exactly which items would be flagged and why — before the crawler
finds it.

**What it is not:** a compliance guarantee, a Shopping-policy reviewer, or a
substitute for reading your own disapproval notices. It answers one narrow
question per item — does this row conform to the documented data
specification — deterministically, from the feed itself, with no model, no
account, and no crawl of your website.

After using this, you can now **catch a missing GTIN, a malformed price, or
promotional text in a title in the same pipeline run that generates the
feed**, which used to take **waiting for Merchant Center or Commerce Manager
to disapprove the item days later, then working backward from a vague
notice to figure out which row caused it.**

## Why this exists

Google Merchant Center and Meta Commerce Manager disapprovals split into two
very different categories, and only one of them is checkable from a feed
file alone:

| Category | Example | Checkable here? |
|---|---|---|
| Data specification | Missing GTIN, malformed price, invalid availability, promotional text in title | Yes — deterministic, from the feed |
| Account / policy | Misrepresentation, prohibited products, landing-page mismatch, account suspension | No — needs Google's/Meta's own crawl and review |

Missing or invalid unique product identifiers (GTIN/MPN + brand) is
consistently reported as one of the most common disapproval reasons, and
Shopify's own community forum carries recurring, actively-answered threads
on exactly this problem — "Why is Google Merchant Center disapproving all my
products?", disapprovals "Due To Violation Of Shopping Ads Policies," and
account suspensions traced back to policy issues. Several other
businesses (Adsmurai, Kontrolit, FeedRevision, ProductPrime, and others)
each publish a free web-form feed validator, which is itself evidence of
real, sustained search demand for exactly this check — none of what exists
is a scriptable, zero-account CLI a team can wire into their own CI or
deploy pipeline the way a linter runs before a merge. That gap — a feed
check that runs unattended, in your pipeline, before the sync — is what
this fills.

See [the docs page](why-products-get-disapproved-in-google-merchant-center.html)
for the full breakdown of which disapproval reasons this tool can and can't
see.

## Try it without installing anything

[`index.html`](index.html) reads a feed file you load or paste — CSV, TSV,
or JSON — entirely in the browser, and reports every item's data-
specification errors and warnings, plus feed-level problems like duplicate
IDs. No fetch happens from the page itself, so nothing you load ever leaves
your device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the file you name — no
network call, ever.

```sh
node cli.mjs check feed.csv                    # human-readable; exits 1 if any error is found
node cli.mjs check feed.csv --json
node cli.mjs check feed.csv --max-warnings 0   # also fail the build on warnings
```

Wire it in right before whatever job syncs your feed:

```yaml
- name: Check product feed
  run: node cli.mjs check feed.csv
```

**Scope, stated plainly.** This checks the feed's own data against the
published product-data specification: required fields present, GTIN/MPN
identifier rules, price/availability format, known promotional-text
triggers, and duplicate IDs within the feed. It does **not** fetch your
landing pages, so it cannot confirm the price or availability in the feed
matches what a shopper actually sees — that check needs Google's or Meta's
own crawl. See the docs page for the full account/policy-vs-data-spec
breakdown.

## Disclaimers

This tool reports whether the feed data you supplied conforms to the
published product-data specification. It is **not** advice about Shopping
Ads policy, account-level compliance, or a guarantee that any listing will
be approved. Verify against your own Merchant Center/Commerce Manager
account and current published policy before relying on it, the same as any
free, best-effort tool.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `file_loaded`) in `localStorage` only — never
transmitted, never tied to your feed or a store. Do Not Track and Global
Privacy Control are honoured, and a button on the page turns it off
entirely. The CLI records nothing and makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The checking engine
and CLI are built and tested; no external user contact has happened yet —
that is the next, non-code step (see `kill_criteria` in `VENTURE.yaml`).
