# Error Keeper

Error tracking for small teams, on your own server. A 1 KB browser snippet and a
Node client send crashes to it; it groups the same bug together, alerts you when
a bug is **new**, when one you fixed **comes back**, and when one **spikes**, and
shows the latest stack. MIT, one Node process, no dependencies, state in a JSON
file, about 400 lines to audit.

Try the grouping on your own stack traces first: open `index.html` (nothing is
uploaded; the page makes no network requests).

## Why use this instead of what you have today

| Today | Problem for a small team | Error Keeper |
|---|---|---|
| Sentry, Rollbar, Bugsnag, Honeybadger | Good products, billed by event volume; self-hosted Sentry is a dozen containers | One process, one file, no per-event fee, stacks stay on your server |
| `console.error` and logs | Nobody reads them until a customer writes in | Grouped, counted per user, alerting on new, regressed and spiking bugs |
| Email-on-exception | One crash loop sends 10,000 emails | One alert per bug, per regression, per spiking hour; per-minute intake cap |
| A hosted free tier | Event caps, retention caps, data leaves your account | Your disk is the limit |

If you need source-map unminifying, session replay or performance tracing, use
Sentry. This is for the founder who wants "what broke, how often, who is hit,
did my fix hold".

## How it works

- **Grouping.** Key = error type + the top three *in-app* stack frames
  (function and file name, never line numbers or bundle hashes), so a deploy
  that shifts lines does not split a group. No stack: the message with numbers,
  ids, UUIDs, quoted values and URLs removed. Override with `fingerprint: [...]`.
- **New issue** alert the first time a group appears.
- **Regression.** Resolve an issue *in a release* (`1.4.2`). An event from that
  release or a later one (compared numerically, so `1.10.0 > 1.9.2`) reopens it
  and alerts. Resolve without a release and any later event reopens it.
- **Spike.** At least 10 events this hour and above the issue's own 24-hour
  baseline (mean + 4 standard deviations, never under 3x the mean). A bug that is
  always noisy does not page you every hour; one alert per issue per hour.
- **Releases.** `/v1/releases` shows events per release and how many groups first
  appeared in each: which deploy broke things.
- **Privacy net.** Emails, bearer tokens, common API-key shapes, JWTs and
  sensitive query values (`token`, `code`, `password`...) are masked before
  anything is stored. User ids are stored only as hashes (a count of distinct
  users, never who).
- **Protection.** Intake is capped per minute (default 600, `MAX_EVENTS_PER_MINUTE`)
  so a crash loop cannot fill the disk or the alert channel; the browser SDK sends
  at most 20 events per page load and one per distinct error per 5 seconds; disk
  writes are coalesced to one per second.

## Run it

```
INGEST_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) \
  ALLOWED_ORIGINS=https://app.example.com node server.mjs
```

Open the server's address, enter the admin key, read the issues.

| Variable | What |
|---|---|
| `INGEST_KEY`, `ADMIN_KEY` | required, 16+ characters, different. The ingest key goes in your front-end code and can only send events; the admin key reads and manages issues |
| `ALLOWED_ORIGINS` | optional comma list; browser events from other origins are refused. Strongly recommended |
| `STATE` | state file, default `/tmp/state.json`; put it on a disk |
| `ALERT_WEBHOOK_URL`, `ALERT_WEBHOOK_SECRET` | optional; a signed POST per alert. The body has `text` and `content`, so a Slack or Discord incoming-webhook URL works as-is |
| `MAX_EVENTS_PER_MINUTE` | intake cap, default 600 |

**Browser:**
```html
<script defer src="https://YOUR-HOST/sdk.js" data-key="INGEST_KEY" data-release="1.4.2"></script>
```
Catches uncaught errors and unhandled rejections; `errorKeeper.capture(err, {user, tags})` for your own.

**Node** (`sdk.mjs`, never throws, never blocks a request):
```js
import { createKeeper } from "./sdk.mjs";
const keeper = createKeeper({ url: "https://errors.example.com", key: process.env.INGEST_KEY, release: "1.4.2", project: "api" });
keeper.install();                 // reports crashes, then exits as it would have
app.use(keeper.middleware());     // Express error handler, after your routes
keeper.capture(err, { user: "acct_42", tags: { route: "/checkout" } });
```

API (`POST /v1/events` takes the ingest key; the rest take `ADMIN_KEY`):

- `POST /v1/events`: `{type, message, stack, release, environment, project, user, tags, fingerprint, id, timestamp}` or `{events:[...]}` up to 50. `id` makes a retry harmless.
- `GET /v1/issues?status=unresolved|resolved|ignored|all&project=&limit=`
- `GET /v1/issues/:id`: counts, releases, environments, latest 5 samples.
- `POST /v1/issues/:id/resolve` (`{release}`), `/ignore`, `/reopen`.
- `GET /v1/releases`.

Alert signature: `x-keeper-signature: sha256=HMAC(ALERT_WEBHOOK_SECRET, body)`.

## One-click deploy

Fork this repository, then open `https://render.com/deploy?repo=<your fork URL>`
(the blueprint is `render.yaml`; Render bills you, nothing runs on the author's
account). Docker: `INGEST_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) docker compose up -d`.
Fly.io: the steps are at the top of `fly.toml`.

## Limits

- No source-map support: minified browser stacks stay minified.
- No accounts or teams: one admin key. Put it behind your VPN or a proxy if that matters.
- Keeps 5,000 issues (stalest resolved ones go first), the newest 5 samples each, 14 days of hourly counts.
- One JSON file rewritten at most once a second: fine for thousands of events a day, not millions.
- A failed alert webhook is retried on the issue's next event, not on a timer.
- A browser ingest key is public by nature; `ALLOWED_ORIGINS` stops other *browsers*, not a determined script, which is what the intake cap is for.

## Disclaimer

Provided free and as-is, without warranty, with no uptime or delivery guarantee.
It can miss errors, group unrelated ones or drop events under load. You run the
server and are responsible for what your app sends it, the keys, backups and the
privacy rules where you and your users live. MIT licensed; donations welcome via
[GitHub Sponsors](https://github.com/sponsors/Duncan-Haywood).
