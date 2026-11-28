---
kind: note
date: 2026-11-28
subjects: [payapps, cmmc, seller-books, jobshop-quote]
---
# Analytics disclosure on the bet sites, and CMMC's blocked beacon (2026-11-28)

A ventures run checked the four live bet apps and their marketing pages in Chromium (mobile width,
console and network logged). Two problems, both fixed in the same PR.

## 1. CMMC's app counted no visits

`https://cmmc.marisstella.app/` logged `Loading the script 'https://static.cloudflareinsights.com/beacon.min.js/...'
violates the following Content Security Policy directive: "script-src 'self'"` on every page. The
zone injects Cloudflare Web Analytics into each HTML response; PayApps, Seller Books and Job Shop
Quote set no CSP on their HTML, so their beacon loaded and posted to `/cdn-cgi/rum`. CMMC's
`public/_headers` CSP refused it, so the app's visits went uncounted.

Fix: `script-src 'self' https://static.cloudflareinsights.com` and `connect-src 'self'
https://cloudflareinsights.com`, nothing else (`ventures/cmmc/apps/cmmc/test/unit/headers.test.ts`
holds both and the rest of the policy). Checked by replaying the live page in Chromium with the new
header: the beacon loaded and `POST /cdn-cgi/rum` answered 204.

## 2. Five privacy notices said there were no analytics

The beacon is on every page of marisstella.app (the build adds it, `platform/analytics/web-analytics.mjs`,
and the zone injects a second copy) and on every app subdomain. The site-wide policy
(`https://marisstella.app/privacy/`) says so. But the product sites' own notices said the opposite:

| Page (live 2026-11-28) | Said |
|---|---|
| marisstella.app/payapps/privacy | "no forms, set no cookies and run no analytics, advertising or other scripts" |
| marisstella.app/cmmc/privacy | "no forms, cookies or tracking scripts" (and its meta description) |
| marisstella.app/seller-books/privacy | "No analytics or advertising scripts run on this site" |
| marisstella.app/jobshop/privacy | "load no analytics or third-party scripts" |
| the four apps' Privacy Policies | silent: Cloudflare listed for hosting only |

A privacy statement that is false on a live page is the kind of claim `prompts/goals.md` rules out
("honest marketing"), and regulators treat it as deceptive. Each notice now has a "Visit counts"
section: Cloudflare Web Analytics counts page views, referrer and load time, no cookies, no
identifier, how to block it, and a link to the site-wide policy. Each app's Privacy Policy gains a
"Visit statistics" bullet and Cloudflare's subprocessor row says "cookieless visit statistics (Web
Analytics)". Each app's `POLICY_VERSION` moved, so signed-in users accept the new text once; no
customer has signed up yet, so nobody is interrupted.

The guard: `platform/pages/analytics-claims.test.mjs` fails when a served product site's source or
committed export says "no analytics", "no tracking scripts" or the like, or when a deployed app's
policy stops naming Cloudflare Web Analytics. Add a new bet's site and app to its two lists.

## Not changed

- `platform/pages/embed.mjs` promises the embed "adds no tracking of any kind to your page". The
  promise is about the host page and its resize script, which sends nothing; the iframe itself is a
  marisstella.app page under the site policy. Left as is.
- E-invoice Fix & Explain's marketing site (`ventures/einvoice-pro/apps/einvoice-site`, "No cookies, no
  analytics" in four languages) is not served on marisstella.app yet. When it is, it must say what the
  zone injects there, or skip the zone's injection; the guard test should list it then.
