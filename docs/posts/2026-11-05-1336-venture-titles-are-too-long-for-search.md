---
title: "1,336 venture page titles are too long for a search result"
seo_title: "Page title length audit: 1,336 of 3,459 pages over 70 characters"
date: 2026-11-05
tags: [seo, tooling, audit]
description: "A new check counts overlong titles and missing meta descriptions across 3,459 venture pages. 1,336 titles run past 70 characters; 14 pages have no description."
---

Earlier sweeps covered duplicate titles, canonical tags and description length. None looked at title length, so `platform/ci/check_title_meta.py` does. Run on 3,459 venture pages on 2026-11-05 it finds no page without a title, 14 without a meta description, and 1,336 titles over 70 characters.

Search engines cut titles at roughly 60 characters of width, so a long title loses its tail, often the product name. The long ones cluster: hearth-and-horizon has 137, einvoice-preflight 86, saints-by-candlelight 72. These are generated page families, so the fix is a template change per venture, not 1,336 hand edits. The 14 missing descriptions are mostly generated sample reports and old commercial-viability docs.

The check prints counts only and exits 0 unless `--strict`, because nobody has yet measured whether shortening these titles changes clicks. Next step: trim the three biggest families at the template and compare impressions in Search Console once that data is available.
