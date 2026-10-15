# cron-heartbeat

After using this, you can now **find out within minutes when a cron job stops
running or starts failing**, which used to mean noticing a missing backup weeks
later.

Two parts, both free and with no account:

- **`index.html`** — paste a crontab, get next runs, the longest healthy
  silence, a suggested grace period, a wrapped command line that reports exit
  status, and a `checks.json`. Runs in the browser; nothing is uploaded.
- **`server.mjs`** — a heartbeat monitor ("dead man's switch") in one Node file
  with no dependencies. Jobs ping `/ping/<name>` (or `/start`, `/fail`); when a
  ping does not arrive by the next scheduled run plus grace, it alerts a
  webhook (Slack/Discord/Mattermost style) and/or an ntfy topic, once, and
  again when the job recovers.

```
CONFIG=example-checks.json PING_KEY=secret ALERT_WEBHOOK_URL=... node server.mjs
node --test
```

## What the monitor does

- **Dashboard** at `/` (needs your key): every check's state, reason and last ping.
- **Public status page** at `/s`, off by default (`PUBLIC_STATUS=1`): names and
  operational/disruption only, no keys, timings or reasons. Title: `STATUS_TITLE`.
- **Maintenance pause**: `/pause/<name>` and `/resume/<name>` (key required) stop and restart
  alerting for one check. Resuming restarts its clock, so the paused time never alerts.
- **Status badge** at `/badge/<name>.svg` (with `PUBLIC_STATUS=1`): an embeddable
  operational / disruption / paused SVG, same disclosure as `/s`.
- **History** at `/history/<name>`: the last 50 pings and alerts per check.
- **Alerts, any mix of**: webhook (Slack/Discord/Mattermost), ntfy, Telegram bot
  (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`), email through your own Resend
  account (`RESEND_API_KEY`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`). One channel
  failing does not stop the others; if all fail it retries next tick.
- **Persistent state** (`STATE`, default `/data/state.json` in Docker, written
  atomically and flushed on shutdown), so a restart does not forget your jobs.
- The key can be sent as `?key=` or `Authorization: Bearer <key>`; pings accept GET or POST.

## Deploy your own copy (nothing runs on the author's side)

A monitor must stay awake and remember state, so every route below gives it a disk and one always-on instance.

- **Render**: fork this repository, open `https://render.com/deploy?repo=<your fork URL>`.
  `render.yaml` builds the `Dockerfile` on the paid *starter* plan (about $7/month, your account)
  with a 1 GB disk and a generated `PING_KEY`. Then set `CHECKS_JSON` and an alert channel in
  the environment tab.
- **Fly.io**: `fly.toml` has the exact commands in its header (volume, secrets, `fly deploy`).
- **Any Docker host**: `PING_KEY=change-me docker compose up -d` (see `docker-compose.yml`).

Ping with `https://<your-service>/ping/<name>?key=<PING_KEY>`; `/healthz` is open for health checks.
Do not use Render's free plan for real monitoring: it sleeps when idle and has no disk.

Files: `cron.mjs` (parser, next-run, evaluate), `monitor.mjs` (alert state
machine, history), `notify.mjs` (alert channels), `dashboard.mjs` (HTML),
`crontab.mjs` (crontab to entries/config), `server.mjs` (HTTP shell),
`usage.mjs` (opt-out local counters).

Timezones: UTC by default. Set `"tz": "Europe/London"` on a check, or put `CRON_TZ=Europe/London` above jobs in the crontab tool, and the schedule is read in that IANA zone. Same as Vixie cron on daylight-saving days: a repeated wall-clock hour counts once, and a time that does not exist (spring forward) is skipped that day, so a missed run on that one day is not detected. The host timezone is never consulted.

Limits, stated plainly: five-field cron plus `@daily`-style macros
(no `@reboot`, no `L`/`W`/`#`); no per-check alert routing or teams; the
monitor is a single process, so run it on a different machine from the jobs
it watches. Not a substitute for real alerting on critical systems.
