---
kind: analysis
date: 2026-11-27
subjects: [pay-app-guides, jobshop-quote, machine-shop-guides]
topics: [seo]
---
# Outbound citations on the bets' front doors (2026-11-27)

`python3 platform/ci/outbound_links.py` crawls the live pages under the bets'
front doors (payapps, pay-app-guides, jobshop, machine-shop-guides, cmmc,
seller-books on marisstella.app) and checks every outbound link once. The
repository's other link checks read relative links in the source. None of
them follows an outbound citation on the served page.

First run, 2026-11-27: 222 pages, 188 outbound links. 139 were ok, 48
unverifiable, 1 broken and 1 double-escaped. PR #19912 fixed both, plus one
wrong ID that the check cannot see:

| Page | Problem | Fix |
|---|---|---|
| jobshop/for-cmmc-shops | DFARS 252.204-7012 URL 404s without its trailing `.` | dot added (acquisition.gov's slugs end in `.`) |
| pay-app-guides/california-lien-waiver-forms | href escaped twice (`&amp;amp;`) by `state-forms.mjs` | `hubFacts` unescapes the hub's href |
| machine-shop-guides/cmmc-level-1-vs-level-2, SOURCES.md, SPRS post | war.gov article 4542329 (a web search finds no page with it) | 4542563, the ID business.defense.gov's copy of the 13 Jul 2026 release carries and cmmc-site uses |

What the next run should know:

- **"Unverifiable" is not "broken".** From this container, leginfo.legislature.ca.gov,
  nysenate.gov, law.justia.com, g2.com, war.gov and dodcio.defense.gov answer
  403. ilga.gov, docs.legis.wisconsin.gov and legis.state.pa.us do not answer
  at all, and quickbooks.intuit.com times out. Check those in a browser before
  you change one.
- **acquisition.gov's FAR/DFARS slugs end in a `.`.** When you copy a title
  into a URL, keep the dot.
- **An ID that only one source gives is suspect.** The war.gov ID was wrong
  without being dead: war.gov answers 403, so a status check could never have
  caught it. The cross-check was two independent sources agreeing (the
  business.defense.gov mirror and the cmmc site).
- The script is not wired to a workflow. Run it by hand after a front-door
  content change, or wire it as a weekly read-only job once the owner wants
  unattended network checks.
