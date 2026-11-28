---
kind: note
date: 2026-11-28
subjects: [analytics, pages, payapps, pay-app-guides]
---
# No marisstella.app page view was being counted: two beacons (2026-11-28)

A ventures run (bet #1, PayApps) crawled the PayApps marketing pages on https://marisstella.app/payapps/
in Chromium at phone width to check the front door a contractor lands on. Every page loaded, no link
was broken and nothing overflowed. But every page logged the same console error: the Cloudflare Web
Analytics POST to `https://cloudflareinsights.com/cdn-cgi/rum` was blocked by CORS.

## What was happening

Every apex page carried two beacons with the same site token:

1. the manual snippet the build adds (`platform/analytics/web-analytics.mjs`,
   `<script defer src=".../beacon.min.js" data-cf-beacon='{"token": ...}'>`), and
2. the zone's automatic-setup copy, which Cloudflare injects into every HTML response
   (`<script type="module" src=".../beacon.min.js/v..." data-cf-beacon='{"version":"2024.11.0",...,"r":1}'>`).

Only one of them posts per page load. The build's ran first, and its POST failed: no `Access-Control-Allow-Origin`
on the response, `net::ERR_FAILED` in the browser. The app subdomains (payapps., cmmc.), which only carry
the zone's copy, posted and got **204**.

Checked by replaying `https://marisstella.app/payapps/` in Playwright with the HTML rewritten:

| Page as served | RUM POST |
|---|---|
| both beacons (live) | failed (`net::ERR_FAILED`) |
| build's tag removed, zone's kept | **204** |
| zone's removed, build's kept | failed |

The payload difference: the zone's beacon sends `versions.fl` (its injection version) and the build's
does not; the site token is the zone's automatic-setup site (`provision.mjs` matches it by
`ruleset.zone_name`). Why Cloudflare refuses the manual snippet for that site is an inference; the
table above is the measurement.

So since the build started adding its tag, no page view on marisstella.app, the guides, the free
tools or the bets' marketing pages had reached Web Analytics. The app subdomains were counted.

## Fix

`platform/analytics/site.json` gains `"beacon": "zone"`. `injectDir` (and with it `build.mjs` and the
deploy's late-pages step, which run the same CLI) adds no tag in that mode; the token still turns on
the legal pages' analytics wording, which stays true because the zone injects on every page.
`"build"` keeps the old behaviour for a host Cloudflare does not inject on. Tests in
`platform/analytics/web-analytics.test.mjs`, including one that the committed file says `zone`.

## For the next run

- After this merges and the pages deploy, load any apex page in a browser and check the RUM POST
  answers 204 (the scratch script: listen for `response` on `/cdn-cgi/rum`). If it does not, the
  page still has two beacons or the zone's setup changed.
- Visit counts on apex pages start from the deploy of this fix. Readings of Web Analytics from before it
  show the subdomains only; do not read the apex's zero as "no traffic" (`portfolio/usage/`: usage is
  unmeasured, not zero).
