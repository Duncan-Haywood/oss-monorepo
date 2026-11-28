# Site analytics

Cloudflare Web Analytics on every page of https://marisstella.app/ (owner,
2026-11-25: "let's set up real analytics and standard privacy policies and
other legal docs").

Why this one: it is cookieless (no consent banner under ePrivacy/PECR; see
`docs/legal/privacy-baseline.md`, "cookieless analytics vendor"), free, and
on the Cloudflare account the site is already hosted on, so it adds no new
vendor or account (`prompts/goals.md`, "Feedback and usage from the site, on
one free account"). It reports page views, visits, referrers, countries,
devices and browsers, and Core Web Vitals, which the first-party counter
(`platform/counter/`, kept as is) does not.

| File | What |
|---|---|
| `site.json` | Host and the public site token. Empty token = ask the API at deploy time. |
| `provision.mjs` | Finds or creates the Web Analytics site for the host through Cloudflare's RUM API and prints the token (to `GITHUB_OUTPUT` in CI). Never fails a deploy. |
| `web-analytics.mjs` | The beacon tag and the pass that adds it before `</body>` on every built page; idempotent; adds nothing when `site.json` says `"beacon": "zone"`. CLI: `node platform/analytics/web-analytics.mjs <dist>`. |

## How it runs

`.github/workflows/priv-portfolio-pages.yml`, pushes to `main` only:

1. The `web-analytics` job runs `provision.mjs` with the deploy token, in a
   job of its own so the build job holds no Cloudflare credential; only the
   public site token reaches the build, as a job output.
2. "Build the site" gets it as `PAGES_WEB_ANALYTICS_TOKEN`. `build.mjs`
   turns `analyticsOn()` on, adds the beacon to its pages, and the footer,
   About page, `llms.txt`, Privacy Policy and Cookie Policy name the
   analytics. With no token none of them do, so the copy cannot get ahead of
   what ships.
3. "Add the web analytics beacon to the late pages" covers pages written
   after `build.mjs` (dev dashboard, daily brief, self-deploy page).

Local builds read `site.json` (or `--web-analytics-token=`).

## One beacon: the zone's (2026-11-28)

marisstella.app is a Cloudflare zone with Web Analytics' automatic setup on:
Cloudflare injects its beacon into every HTML response, apex and app
subdomains alike, with the same site token `provision.mjs` finds. Until
2026-11-28 the build added the manual snippet as well, and that broke the
count on every apex page: the build's tag loaded first, the zone's copy saw a
beacon already running and stayed quiet, and the build's POST to
`https://cloudflareinsights.com/cdn-cgi/rum` failed (404 with no CORS
header). The app subdomains, which carry only the zone's copy, posted 204.
Replaying the live page in Chromium with the build's tag stripped gave 204;
with the zone's stripped, the failure again
([`docs/reports/2026-11-28-apex-analytics-double-beacon.md`](../../docs/reports/2026-11-28-apex-analytics-double-beacon.md)).

So `site.json` says `"beacon": "zone"`: the build and the late-pages step add
no tag, and the token still turns on the analytics wording in the legal
pages, which stays true because the zone injects. Set `"beacon": "build"`
only for a host Cloudflare does not inject on, and check the RUM POST in a
browser after the deploy either way. If the zone's automatic setup is ever
turned off, switch to `"build"` in the same change.

## Owner step

> **Parked (owner, 2026-11-27):** analytics will be set up in more depth on
> AWS after the move; the `web-analytics-token` row is gone from
> `portfolio/ledger/asks.yaml`. (Stale since: by 2026-11-28 the deploy found
> the token, the zone injects the beacon on every page and the legal pages
> name the analytics; see "One beacon" above.)

The deploy token could not read zone analytics on 2026-11-19, so it probably
cannot create a Web Analytics site either. `portfolio/ledger/asks.yaml`,
`web-analytics-token`, gives the two ways to fix it (a token permission, or
add the site in the dashboard and commit its public token to `site.json`).
`provision.mjs` was written without access to Cloudflare's API reference
(the docs host was not reachable from the session): its first live run's log
says whether the list/create calls and response fields are as assumed.

## Legal pages

`platform/pages/legal-pages.mjs` renders `/privacy/`, `/terms/` and
`/cookies/` and the footer summary. They replace the old "nothing is
collected, no analytics vendor" promise. Any change to what is collected
changes those pages in the same PR.

## Known gaps

From the 2026-11-26 quality audit
([`../../portfolio/quality/audits/2026-11-26-analytics.json`](../../portfolio/quality/audits/2026-11-26-analytics.json)):
`provision.mjs` reads only the first page of the Cloudflare site list, so a
host past page 1 would get a duplicate site created; neither CLI is tested
beyond the malformed-token case; and with `site.json`'s token still empty,
nothing is measured yet and nothing pulls the numbers into `portfolio/usage/`.

## Next

- Pull the Web Analytics numbers into the repository daily
  (`rumPageloadEventsAdaptiveGroups` in Cloudflare's GraphQL API, beside
  `platform/counter/pull-cloudflare.mjs`), once the token can read them.
- Funnels with an identifier (returning visitors, signup conversion) would
  need consent in the EU/UK; build them with the paid products' own
  analytics, not on this site.
