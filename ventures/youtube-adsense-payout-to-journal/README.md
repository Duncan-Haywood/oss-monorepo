# YouTube AdSense to Journal

A free browser tool for YouTube creators and their bookkeepers: **drop in the AdSense payments CSV and get a balanced Xero, QuickBooks Online, QuickBooks Desktop (IIF) or plain CSV journal.** The file is read in the browser; nothing is uploaded.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/youtube-adsense-payout-to-journal/

After using this, you can now **book AdSense revenue, the US tax Google withheld (as its own receivable), the bank deposit and the realised FX gain or loss on separate lines, split by month and checked against what reached your bank**, which used to mean booking the net deposit as income.

Files: `calc.mjs` (parser, classifier, FX valuation, journal builders, no DOM, no network), `index.html` (the page), `usage.mjs` (opt-out local counters). Tests: `node --test 'ventures/youtube-adsense-payout-to-journal/**/*.test.mjs'`.

Unverified: column names and importer layouts are from memory of public help documents; no real AdSense export was available.
