# visit-keeper

After using this, you can now **see who visits your site, where they came from and which source brings paying customers**, with no cookies, no IP addresses stored and nobody else holding your data, which used to mean a monthly fee that climbs with pageviews (Plausible, Fathom, Simple Analytics) or a consent banner and an ad company (Google Analytics).

Free and MIT. One Node 22 process, **zero dependencies**, state in one JSON file, about 700 lines to audit.

- **`index.html`**: the setup page. Builds your snippet and estimates disk use. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: the collector, the dashboard and the API.

## Why someone would use this

| Today | Cost / catch | visit-keeper |
|---|---|---|
| Google Analytics | Cookies, consent banners, a heavy script; data lives with an ad company | No cookies, a script under 1 KB, data on your server |
| Plausible, Fathom, Simple Analytics | Good products; billed monthly and by pageviews | No per-pageview fee; you run and update it |
| Umami, Matomo | Powerful, but a database to run and patch | One process, one JSON file |
| Server logs, GoatCounter | No campaign or goal attribution by source | UTM, referrers and **goals by source** in one table |

Honest limits: no session replay, heatmaps, funnels, cross-day unique visitors or cross-device identity (on purpose). A visitor who returns on another day counts again. Visit duration is measured between pages, so a one-page visit has none. Country needs a proxy that sets a country header (Cloudflare's `CF-IPCountry` by default). It is one process on one host with a JSON file: fine for sites up to a few hundred thousand pageviews a day, not a data warehouse.

## How it counts without tracking people

A visitor is `sha256(secret | UTC date | site | IP | user-agent)`, cut to 16 hex characters. The IP and user-agent are hashed in memory and never written down; the date in the hash means the same person is a different visitor tomorrow. Per-visitor scratch data (the hash, last-seen time, pages seen) is deleted after a day or two. What stays on disk is daily counters. The browser gets no cookie and nothing in localStorage.

- A **visit** ends after 30 minutes without a pageview. A visit with one pageview is a **bounce**.
- **Bots** (known crawler, headless and library user agents) are dropped and get the same `202` as everyone, so they learn nothing.
- **Do Not Track** and **Global Privacy Control** are honoured by the script and by the server. Pass `data-ignore-dnt` on the script tag to turn that off.
- **Sources**: `utm_source` (or `ref`, `source`) beats the referrer; a referrer from your own site is ignored; no referrer is `(direct)`.
- **Goals**: `visitKeeper("signup")` or `visitKeeper("purchase", 29)`. Each goal counts once per visitor per day; values are summed. The dashboard shows each goal's conversion rate and its best sources as conversions per visit from that source.

## Run it

```
ADMIN_KEY=$(openssl rand -hex 16) SITES=example.com node server.mjs
```

Then add this to the head of your pages:

```html
<script defer src="https://YOUR-HOST/t.js"></script>
```

| Variable | Meaning |
|---|---|
| `ADMIN_KEY` | required, 12+ characters; password for the dashboard (any user name) and the API |
| `SITES` | required; comma-separated hostnames you may count. Beacons for any other host are refused |
| `PUBLIC_SITES` | optional; sites whose read-only dashboard and API are public at `/share/<site>` |
| `STATE` | path of the JSON state file (mount a disk here) |
| `TRUST_PROXY` | `1` when a proxy sets `X-Forwarded-For`. Leave unset on a bare server, or visitors are one address |
| `COUNTRY_HEADER` | header carrying a 2-letter country code (default `cf-ipcountry`) |
| `SECRET` | optional; salt for visitor hashes (defaults to `ADMIN_KEY`). Changing it just resets who counts as returning today |
| `RETENTION_DAYS` | daily counters kept (default 730) |
| `RATE_PER_MINUTE` | beacons accepted per address per minute (default 120, in memory) |
| `TITLE`, `PORT`, `SAVE_EVERY_MS` | page title, port (8080), save interval (15000) |

API (Bearer `ADMIN_KEY`, or Basic auth, or open for `PUBLIC_SITES`):

```
GET /api/stats?site=example.com&days=30      totals, previous period, series, pages, sources, goals...
GET /api/stats.csv?site=example.com&days=30  day,visitors,views
```

Single-page apps are counted on every `history.pushState` and back/forward. Serve the script from a subdomain of your own site to avoid most ad blockers.

## Deploy

Render one-click blueprint (`render.yaml`), Fly.io (`fly.toml`), or `docker compose up -d` (`docker-compose.yml`). Each builds in your own account and keeps state on a disk you own.

## Tests

```
node --test ventures/visit-keeper/*.test.mjs
```

## Disclaimer

Free and as-is, no warranty, no uptime guarantee. Counts can be off. This is not legal advice: whether you need a privacy notice or consent depends on where your visitors are. Donations: https://github.com/sponsors/Duncan-Haywood
