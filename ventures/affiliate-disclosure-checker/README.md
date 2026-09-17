# Affiliate Disclosure Checker

A free, zero-network, zero-dependency CLI + browser tool that scans a blog
post or page's HTML for recognised affiliate-link signals — Amazon
Associates `tag=` links, `amzn.to` short links, `rel="sponsored"`, and
known affiliate-network tracking domains (ShareASale, CJ/Commission
Junction, Rakuten/LinkSynergy, Impact, Skimlinks, VigLink, rewardStyle/LTK,
AWIN, AvantLink) — and reports whether a disclosure phrase appears
**before** the first one, in reading order. It separately checks whether
any Amazon link carries Amazon's own required exact statement ("As an
Amazon Associate I earn from qualifying purchases"), which the FTC's
general "clear and conspicuous" standard does not by itself satisfy.

After using this, you can now **tell whether a post's affiliate disclosure
is missing or just placed too late, in one paste**, which used to take
manually re-reading a post in the order a visitor sees it and cross-checking
every link by hand — the kind of check that is easy to skip on a busy
publishing day and expensive to have skipped once Amazon notices.

**What it is not:** a legal or compliance determination, and not a
guarantee of FTC or Amazon compliance. It reports which known affiliate-link
and disclosure-phrase patterns it recognises in the text provided, nothing
more — read the FTC's Endorsement Guides and Amazon's Associates Program
Operating Agreement, and consult a professional if you need a determination
you can rely on.

## Why this exists

Amazon's Associates Program Operating Agreement requires every page
carrying an Associates link to state, in substance, "As an Amazon Associate
I earn from qualifying purchases." Amazon has terminated associate accounts
for missing this — which erases the account's entire earning history, not
just future commissions — so a missing or late disclosure is a real,
checkable income risk for a blogger or content creator, not a hypothetical
one. `r/AmazonAssociates` and `r/Blogging` carry recurring threads from
people who found out the hard way.

`affiliate-disclosure-checker` is a different-vertical sibling of this
portfolio's other zero-dependency, deterministic, no-verdict checkers (like
[`env-example-drift-check`](../env-example-drift-check/) and
[`structured-data-drift-check`](../structured-data-drift-check/)): those
serve a developer checking a repo artifact against its own source; this
serves a blogger or content creator checking their own published page
against a disclosure requirement.

## Try it without installing anything

[`index.html`](index.html) parses the HTML you paste entirely in the
browser. Paste a post's full page HTML (view source, or export from your
CMS) and it lists every affiliate link it recognises, whether a disclosure
phrase appears before the first one, and whether any Amazon link carries
Amazon's own required exact statement. Nothing you paste ever leaves your
device.

## Quickstart (CLI)

Zero dependencies, one file, Node 18+. Reads only the local files/directories
you name — no network call, ever.

```sh
node cli.mjs check post.html                # one file, human-readable
node cli.mjs check dist --json                 # a whole build output dir, machine-readable
node cli.mjs check dist --strict                # also fail on a missing Amazon-required phrase
```

Exits 1 if any scanned file is missing a disclosure, or discloses only
after the first affiliate link (or, with `--strict`, also if an Amazon link
lacks Amazon's own required exact phrase). Exits 0 otherwise, 2 on bad
usage.

More, including what "clear and conspicuous" and Amazon's own requirement
actually ask for:
[the docs page](what-disclosure-does-amazon-associates-and-the-ftc-require.html).

## What's scanned

| Signal | What it means |
|---|---|
| Amazon Associates `tag=` link, or `amzn.to` | Amazon's own tracking parameter / link shortener |
| `rel="sponsored"` | Google's own recommended annotation for a paid or affiliate link, any network |
| Known affiliate-network tracking domain | ShareASale, CJ/Commission Junction, Rakuten/LinkSynergy, Impact, Skimlinks, VigLink, rewardStyle/LTK, AWIN, AvantLink, and similar |
| Generic tracking parameter | `irclickid=`, `affiliate_id=`, `aff_id=` |

Matched against visible text and link markup only — `<script>`, `<style>`,
and HTML comments are never scanned. It cannot see a link built dynamically
by client-side JavaScript that never appears in the pasted markup, and it
does not attempt to identify every affiliate network in existence, only the
widely-used ones above.

## Disclaimers

This tool reports whether a variable-length list of known affiliate-link
and disclosure-phrase patterns appears, and in what order — not a legal
determination. It is not affiliated with, endorsed by, or sponsored by
Amazon, Amazon Associates, or any affiliate network named above; each is a
trademark of its respective owner, named here only to describe what this
tool checks for. **You are responsible for reviewing and verifying its
output before relying on it**, and for meeting any disclosure obligation it
helps you check. To the maximum extent permitted by law, the authors accept
no liability for any loss or damage arising from its use.

Optional [GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood) never
changes what this tool does.

## Privacy-conscious usage tracking

The browser page counts anonymous feature events (`check_run`,
`example_loaded`) in `localStorage` only — never transmitted, never tied to
the text you pasted. Do Not Track and Global Privacy Control are honoured,
and a button on the page turns it off entirely. The CLI records nothing and
makes no network call.

## Development

```sh
node --test engine.test.mjs cli.test.mjs page.test.mjs
```

## Status

`stage: prototype` in [`VENTURE.yaml`](VENTURE.yaml). The diff engine, CLI
(with directory walking), and browser page are built and tested; no
external user contact has happened yet — that is the next, non-code step
(see `kill_criteria` in `VENTURE.yaml`).
