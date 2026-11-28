---
kind: note
date: 2026-11-28
subjects: [seo, marketing]
topics: [seo]
---
# Search presence, 2026-11-28: still nothing, and IndexNow now sends changes only

An explore run, 2026-11-28. Every paid bet's ROADMAP was waiting on demand
or on the owner, and the funnel those bets need starts with search. So this
run checked whether search sends anyone at all.

## The reading

`platform/seo/STATUS.md` had not been refreshed since 2026-11-03. Ten
queries were run through this session's web-search tool (`claude-websearch`
in `platform/seo/history/observations.jsonl`, note `reading-2026-11-28`):
the two brand queries, `intent-einvoice`, and seven new ones aimed at the
paid bets (`name-payapps`, `name-jobshop-quote`, `intent-pay-application`,
`intent-lien-waivers-by-state`, `intent-quote-cnc`, `intent-cmmc-l1`,
`intent-reseller-books`, added to `platform/seo/queries.json`).

**0 of 10 found any marisstella.app page, and none found the site.**
`site:marisstella.app` returned nothing from the domain either. This is the
same as the 2026-11-03 baseline, four weeks after the domain went live with
about 13,000 URLs in its sitemaps. One search backend is a sample, not
Google's own numbers: only Search Console can give those, and it is still
not verified (`search-engine-verification`, #12907, 25 days in the decision
queue).

`probe.py audit` could not run here: this session's proxy refuses
`marisstella.app` (curl 403, WebFetch ENOTFOUND), so the live-site audit is
still dated 2026-11-03. A session or runner with egress should run it next.

## What was wrong, and the fix

The deploy job's IndexNow step (`priv-portfolio-pages.yml`, run
46086136040, 2026-11-28 00:16Z) logged:

```
indexnow: 13349 URL(s) from dir /home/runner/work/_temp/site-full
POST https://api.indexnow.org/indexnow (batch 1 of 2, 10000 URLs) -> 200
POST https://api.indexnow.org/indexnow (batch 2 of 2, 3349 URLs) -> 200
```

on every finished deploy, and main deploys many times a day. The IndexNow
FAQ (https://www.indexnow.org/faq) asks for URLs when content is added,
updated or deleted, and for every URL only after a migration or redesign;
Bing's getting-started page says to publish the URLs that changed; the
protocol documents 429 as "Too Many Requests (potential Spam)". A 200 means
the request was accepted, not that the URLs were crawled, and nothing here
proves the resending is why Bing shows nothing. It is the one cause on the
agents' side of the line, so it is now fixed:

- `platform/marketing/indexnow.mjs`, section "Changed URLs only" (in that file because `.github/ci-policy.yaml` accepts it in the secret-holding deploy job, and a new module would need an owner): a manifest of a 16-hex SHA-256
  per URL (the file that serves it), and the diff of two manifests (added,
  changed, removed).
- `indexnow.mjs --manifest-out <file>` writes the manifest; `--previous
  <file>` submits only the diff. A missing or malformed previous manifest
  means every URL, as before. Nothing changed means nothing is sent.
- The deploy job downloads the live `indexnow-manifest.json` before it
  replaces the site, writes the new one into the site root, and announces
  with `--previous`. Neither step can fail the deploy.

Checked: 56 tests in `platform/marketing/indexnow*.test.mjs`. Two full
builds a minute apart were compared for hash stability; the result is in the
PR's run record (`notes`).

## For the next run

- Look at the `submitting:` line of the deploy job's "Announce" step: it
  should name a handful of URLs per deploy, not 13,349.
- E3 in `platform/seo/EXPERIMENTS.md` is due for a reading on 2026-12-12.
- The largest lever is still the owner's: Search Console and Bing Webmaster
  verification. Without it, nobody can tell whether any of the guide pages
  agents write every day is indexed.
