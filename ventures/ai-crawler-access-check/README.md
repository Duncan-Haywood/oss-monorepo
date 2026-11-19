# AI Crawler Access Check

A free tool that checks a `robots.txt` against 20 named AI-crawler
user-agent tokens — GPTBot, ChatGPT-User, OAI-SearchBot (OpenAI); ClaudeBot,
Claude-User, Claude-SearchBot (Anthropic); Google-Extended (Google);
Applebot-Extended (Apple); CCBot (Common Crawl); PerplexityBot,
Perplexity-User (Perplexity); Bytespider (ByteDance); Amazonbot (Amazon);
Meta-ExternalAgent, Meta-ExternalFetcher and FacebookBot (Meta); DuckAssistBot (DuckDuckGo); MistralAI-User (Mistral AI); Google-CloudVertexBot (Google); Diffbot — and reports which are allowed, blocked,
or fall through to the wildcard group and end up partially blocked. It also
does a lightweight structural check of `llms.txt`, the emerging
[llmstxt.org](https://llmstxt.org/) convention.

**Live tool:** https://marisstella.app/ai-crawler-access-check/

After using this, you can now **tell exactly which AI crawlers your site
currently allows or blocks, in one paste**, which used to take manually
cross-referencing your `robots.txt` against each crawler operator's own docs
page, one bot at a time.

## Why this exists

Site owners increasingly have an opinion about AI crawlers — block the ones
that train models on their content, keep the ones that drive traffic through
AI search and citations — but `robots.txt` treats every user-agent as an
independent group, and it's easy to write a wildcard block that silently
misses (or accidentally reaches) a named bot, or a named-bot rule that never
gets checked again after the wildcard group changes. This reads the file
mechanically and reports the actual, current effect per crawler, by the
rules of RFC 9309 as Google's open-source parser applies them (see "How the
matching was checked" below).

**What this is not:** an enforcement mechanism, a guarantee any crawler
honors your file, or a complete list of every AI-related crawler that
exists. See the disclaimers below.

## Two interfaces, one classification module

| | Where | Reads | Use it when |
|---|---|---|---|
| **Browser tool** (`index.html`) | Paste text, entirely client-side | Text you paste or an automatic same-page fetch attempt | You want an instant check with nothing to install, or a link to hand a colleague |
| **Node CLI** (`cli.mjs`) | Your machine | A domain's live `robots.txt`/`llms.txt` over HTTPS, or local files | You want to fetch an arbitrary domain (browsers can't, due to CORS) or wire this into your own CI as a gate |

Both import the exact same `audit.mjs` module, so a paste in the browser and
a CLI run classify identically — `audit.test.mjs` is the shared test suite.

## Try it without installing anything

Open [`index.html`](index.html), paste your `robots.txt` (and optionally
`llms.txt`), and click **Check access**. There's also a "try fetching
automatically" button — it works for sites that don't restrict cross-site
requests to their static files, and tells you plainly when it can't, with
the one-line `curl` command to get the text yourself.

## Quickstart (CLI)

```sh
node cli.mjs example.com                          # human-readable report
node cli.mjs example.com --json                    # machine-readable
node cli.mjs example.com --fail-if-blocked GPTBot,ClaudeBot   # CI gate: exit 1 if either is blocked
node cli.mjs example.com --fail-if-allowed Bytespider          # CI gate: exit 1 if it's allowed
node cli.mjs --robots-file ./robots.txt --llms-file ./llms.txt # no network at all
```

Zero dependencies — Node 18+ built-ins only (`fetch`, `fs`), one file,
nothing to install.

## Disclaimers

This tool reports what a `robots.txt` or `llms.txt` file says. It does
**not** verify that any crawler actually honors those directives —
`robots.txt` is a request, not access control, and it cannot authenticate
who is really making a request. The bot list is a snapshot summarized from
public reporting and each operator's own documentation as of this tool's
last update; operators add crawlers and change stated purposes over time.
Verify anything load-bearing directly with the operator.

**No warranty.** This tool is provided free and as-is, without warranty of
any kind, express or implied. It reports what a robots.txt or llms.txt
file says — it is not a guarantee that any crawler will honor those
directives, and it does not replace reading the crawler operator's own
current documentation. **You are responsible for reviewing and verifying
its output before relying on it.** To the maximum extent permitted by
law, the authors accept no liability for any loss or damage arising from
its use.

**Best-effort hosting, no SLA.** These tools are free, experimental, and
may be slow, broken, moved, or taken offline without notice. We do not
promise uptime, backups of anything you type, or that a URL will keep
working. Do not use this as a system of record. If a tool needs to
survive, get `cli.mjs` and run it yourself.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood)
never changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`, `fetch_attempted`) in `localStorage` only — never
transmitted, never tied to a domain, a robots.txt, or its contents. Do Not
Track and Global Privacy Control are honoured, and a button on the page
turns it off entirely. The CLI records nothing and makes no network call
beyond the domain you name.

## How the matching was checked

`conformance-cases.mjs` holds 71 cases, each restating in our own files one
behaviour that the unit tests of Google's open-source robots.txt parser
([google/robotstxt](https://github.com/google/robotstxt), Apache-2.0, read at
commit `22b355f`; no code or text copied) check: 19 behaviours, 14 of them
required by [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) and 5 of
them Google's leniencies. `conformance.test.mjs` runs them on every change.

The matcher this tool shipped before 2026-11-19 got 55 of the 71 right
([eval/conformance-2026-11-19.md](eval/conformance-2026-11-19.md)). What it
missed, all now fixed:

- It read only the **first** group naming a crawler (and only the first `*`
  group); the RFC merges every matching group.
- `User-agent: CCBot/2.0` did not match CCBot: the value is cut to its product
  token before comparing.
- A named group with no rules at the end of the file fell through to `*`.
- Non-ASCII patterns (`/café/`) were not percent-encoded, and lower-case
  escapes (`%c3%a9`) were not normalised.
- Old-Mac line endings (a lone CR) read the whole file as one line.
- Google's accepted typos (`Useragent`, `Dissallow`, `Disalow`), a missing
  colon (`Disallow /`) and `Allow: /dir/index.html` meaning `/dir/` were not
  honoured, and `/robots.txt` itself could be reported blocked.
- Patterns were matched with a regular expression built from the `*`s. A
  pasted pattern of 30 `*a` pairs took **26 seconds** against a 40-character
  path and froze the page (and the CLI on a hostile site's file). The matcher
  is now Google's position-set algorithm, linear in path times pattern
  (0.1 ms on the same input).

Still out of scope: `Crawl-delay` and other non-standard lines (Google ignores
them too), and what a crawler does when `robots.txt` returns an error status.

## Development

```sh
node --test audit.test.mjs conformance.test.mjs cli.test.mjs page.test.mjs
```

`audit.test.mjs` covers the robots.txt parser and matcher (grouping,
wildcards, `$` anchors, tie-breaking, case-insensitivity) and the `llms.txt`
structural checks; `conformance.test.mjs` the 71 RFC 9309 cases above. `cli.test.mjs` covers the CLI with a stubbed `fetch` and
stubbed file reads — no real network call runs in CI.

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml).
