# Link Keeper

After using this, you can **run short links on your own domain, tag every
campaign link with UTM parameters, send iPhone and Android visitors to the
right app store, and see clicks by day, referrer and device**, without paying
a per-link or per-click tier and without storing anyone's IP address.

Two parts, both free and MIT:

- **`index.html`**: a campaign-link planner. Paste destinations, set
  `utm_source/medium/campaign`, and get the tagged URLs and short names, plus
  the JSON body for the bulk API. It runs the same `engine.mjs` as the server,
  in your browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. It redirects, counts and serves stats.

## Why someone would use this

| Today | Cost / catch | Link Keeper |
|---|---|---|
| Bitly, Rebrandly, Short.io, Dub | Branded domain, click history and analytics sit behind plan tiers priced by links or tracked clicks | Your domain, unlimited links, no tier |
| YOURLS, Shlink, Kutt | Free, but need PHP + MySQL, or Node + Postgres + Redis, to run a redirect | One process, one JSON file |
| Plain UTM links in a spreadsheet | Long ugly URLs, no stats, typos in `utm_source` split your reports | Short names, consistent tags, stats per link |
| Google Analytics only | Needs the destination page to carry the script; misses app-store and PDF links | Counts at the redirect |

Honest limits: no web dashboard (stats are a JSON API and a CSV), no QR image
generator, no team accounts or roles, no per-link passwords, no geo lookup of
its own (country only if your proxy sends a country header), state is a single
JSON file written every few seconds (fine for thousands of clicks a day, not
millions). Clicks in the last few seconds can be lost if the process is killed
hard; a normal stop saves them.

## Run it

```
ADMIN_KEY=$(openssl rand -hex 16) BASE_URL=https://go.example.com node server.mjs
```

| Variable | Meaning |
|---|---|
| `ADMIN_KEY` | Required, 16+ characters. Creating and reading links needs it as `Authorization: Bearer ...`. |
| `BASE_URL` | Your public address; used to print full short URLs. |
| `STATE` | JSON state file. Put it on a volume. Default `/tmp/state.json`. |
| `ALLOW_HOSTS` | Optional comma list. If set, links may only point at these domains (and subdomains). |
| `ROOT_REDIRECT` | Where `/` sends visitors, for example your homepage. |
| `REDIRECT_STATUS` | `301`, `302` (default), `307` or `308`. Use 302 if you may edit a link later; browsers cache 301 for good. |
| `TRUST_PROXY` | `true` behind a proxy that sets `X-Forwarded-For`. Only used to tell visitors apart for the day, never stored. |

## API (all `/v1` calls need the admin key)

```
POST   /v1/links            {url, slug?, title?, tags?, utm?, ios?, android?, expiresAt?, maxClicks?}
POST   /v1/links/bulk       {links:[...]}   up to 200; each result says ok or why not
GET    /v1/links?tag=&q=
GET    /v1/links/:slug
PATCH  /v1/links/:slug      {url?, utm?, title?, archived?, expiresAt?, maxClicks?}
DELETE /v1/links/:slug      archives it (visitors get 410); PATCH {archived:false} brings it back
GET    /v1/links/:slug/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
GET    /v1/export.csv
```

Visitors use `GET /:slug`. `GET /:slug+` shows the destination without
following it, so recipients can check a link before opening it.

- **UTM:** `utm: {source, medium, campaign, term, content}` is added to the
  destination; an existing value of the same name is replaced.
- **App routing:** `ios` and `android` destinations are used when the visitor's
  User-Agent is an iPhone/iPad or Android device; everyone else gets `url`.
- **Ending a link:** `expiresAt` (ISO date) and `maxClicks` return `410 Gone`
  once reached. Bots do not use up `maxClicks`.
- **Safety:** only `http(s)` destinations; no `javascript:`, `data:` or URLs
  with a username or password; slugs cannot shadow `admin`, `api` or `v1`.

### What it records

Per link and day: clicks, bot hits, unique visitors, referrer **host** (never
the path or query), device class, browser family and, when your proxy sends
`CF-IPCountry`, `X-Vercel-IP-Country` or `X-Country`, a two-letter country.
Unique visitors use a hash with a random salt that is discarded at the end of
each UTC day. No IP address, raw User-Agent or cookie is ever stored, and a
visitor cannot be followed across days. Bots (crawlers, link-preview fetchers,
`curl`) are counted apart. Daily rows are kept 400 days.

## One-click deploy

Fork this repository, then open
`https://render.com/deploy?repo=<your fork URL>` (blueprint `render.yaml`;
Render bills you, nothing runs on the author's account). Set `BASE_URL`, read
the generated `ADMIN_KEY` in the dashboard, and attach your own domain. Fly.io:
the steps are at the top of `fly.toml`. Docker: `docker compose up -d` with
`ADMIN_KEY` and `BASE_URL` in a `.env`.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. You run
it, so you are responsible for where your links point, for backups, and for
following the privacy, marketing and consumer-protection rules that apply to
you and your visitors. Not legal, tax or financial advice. If it helps,
[sponsor the author](https://github.com/sponsors/Duncan-Haywood).
