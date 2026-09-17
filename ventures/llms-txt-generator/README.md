# llms.txt Generator

A free tool that builds a spec-compliant
[`llms.txt`](https://llmstxt.org/) file — the emerging convention that gives
AI assistants a short, curated map of a site's key pages — from a pasted
page list, a `sitemap.xml`, or (via the CLI) a local Markdown docs tree. It
also validates an existing `llms.txt` against the same structural rules.

After using this, you can now **publish a correctly structured `llms.txt` in
under a minute**, which used to take hand-writing the exact Markdown shape
the convention describes (H1 title, optional blockquote summary, `##`
section headings, `- [title](url): note` link bullets) and hoping you didn't
typo a bracket.

## Why this exists

`llms.txt` is a real, growing convention — several documentation platforms
and static-site generators have started publishing one by default, and it is
an active, ongoing topic in webdev and SEO discussion (Hacker News threads
on the original Answer.AI proposal, r/webdev and r/TechSEO threads asking
"what is llms.txt and do I need one", and a small but real category of
existing "llms.txt generator" tools built by others — evidence of real,
sustained interest in the search phrase, not proof of search volume this
session could pull directly: outbound HTTPS to arbitrary hosts is
egress-denied here, the same limitation `ai-crawler-access-check`'s
write-up records, so this channel claim is reasoned from known, stable
developer-community behavior and the existence of competing tools, not a
verified traffic figure). The format itself is simple, but getting the exact
Markdown shape right by hand — and keeping it in sync as pages are added or
removed — is exactly the kind of small, mechanical, error-prone task a free
static tool should absorb.

**What this is not:** a certifier that any AI assistant will read or honor
the file, or a judge of which pages *should* be in it — that's the
publisher's call. See the disclaimers below.

## Two interfaces, one generator module

| | Where | Builds from | Use it when |
|---|---|---|---|
| **Browser tool** (`index.html`) | Paste text, entirely client-side | A pasted page list, or a pasted `sitemap.xml` | You want a one-off file with nothing to install, or to validate a file you already have |
| **Node CLI** (`cli.mjs`) | Your machine | A local Markdown docs tree, a local or live `sitemap.xml`, or a URL list file | You want this regenerated automatically on every deploy, or wired into CI |

Both import the exact same `generator.mjs` module, so a paste in the browser
and a CLI run produce identical output — `generator.test.mjs` is the shared
test suite.

## Try it without installing anything

Open [`index.html`](index.html). Tab 1 builds from a short list of
`url | title | note` lines grouped under `## Section` headings you name;
tab 2 builds from a pasted `sitemap.xml` (one link per URL, useful as a
starting point to then hand-edit titles); tab 3 validates an `llms.txt` you
already have and paste in.

## Quickstart (CLI)

```sh
node cli.mjs --dir ./docs --title "Example Docs" --base-url https://example.com
node cli.mjs --sitemap https://example.com/sitemap.xml --title "Example Site" --out llms.txt
node cli.mjs --urls-file ./urls.txt --title "Example Site"
node cli.mjs --check ./llms.txt        # exits 1 on structural errors
```

`--dir` walks a local Markdown docs tree (`*.md`/`*.markdown`), reads each
file's own `# Heading` and first paragraph (no invented text — if a file has
neither, its own relative path stands in as the title), and groups files by
their top-level subdirectory into `## Section` headings. `--sitemap` accepts
either a local file path or an `http(s)://` URL — a live URL is fetched
directly with Node's built-in `fetch`, which has no CORS restriction, unlike
the browser page. Zero dependencies — Node 18+ built-ins only, one file
(plus `generator.mjs`), nothing to install.

## Disclaimers

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It produces a file matching the structural
shape of the llmstxt.org convention — it does not guarantee any AI assistant
reads or honors it, and it cannot judge whether the pages you chose to
include are the right ones. **You are responsible for reviewing and
verifying its output before publishing it.** To the maximum extent permitted
by law, the authors accept no liability for any loss or damage arising from
its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and may
be slow, broken, moved, or taken offline without notice. We do not promise
uptime, backups of anything you type, or that a URL will keep working. Do
not use this as a system of record. If a tool needs to survive, get
`cli.mjs` and run it yourself.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`build_list`,
`build_sitemap`, `check_run`, `example_loaded`, `fetch_attempted`,
`download_clicked`) in `localStorage` only — never transmitted, never tied
to any content you paste. Do Not Track and Global Privacy Control are
honoured, and a button on the page turns it off entirely. The CLI records
nothing and makes no network call beyond a sitemap URL you explicitly name.

## Development

```sh
node --test generator.test.mjs cli.test.mjs page.test.mjs
```

`generator.test.mjs` covers building, validating, sitemap parsing, the
page-list mini-format, base-URL resolution, and Markdown summary extraction.
`cli.test.mjs` covers the CLI with stubbed filesystem/fetch calls — no real
disk or network access runs in CI.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml).
