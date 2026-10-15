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

## One-click deploy (your own account)

Fork this repository, then open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here on Render's free plan in **your**
account and generates a `PING_KEY`. Nothing runs on the author's side. After
deploy, set in Render's environment tab:

- `CHECKS_JSON`: your checks, same shape as `example-checks.json` (one line).
- `ALERT_WEBHOOK_URL` and/or `ALERT_NTFY_URL`: where alerts go.

Ping with `https://<your-service>.onrender.com/ping/<name>?key=<PING_KEY>`.
`/healthz` is open for the host's health check. Caveat: the free plan's disk is
ephemeral and the service sleeps when idle, so a sleeping instance misses
alerts; use a paid plan or any always-on Docker host for real monitoring. Docker
anywhere: `docker build -t cron-heartbeat . && docker run -p 8080:8080 -e PING_KEY=change-me -e CHECKS_JSON="$(cat example-checks.json)" cron-heartbeat`.

Files: `cron.mjs` (parser, next-run, evaluate), `monitor.mjs` (alert state
machine), `crontab.mjs` (crontab → entries/config), `server.mjs` (HTTP shell),
`usage.mjs` (opt-out local counters).

Limits, stated plainly: UTC only; five-field cron plus `@daily`-style macros
(no `@reboot`, no `L`/`W`/`#`); no email alerts or UI in this version; the
monitor is a single process, so run it on a different machine from the jobs
it watches. Not a substitute for real alerting on critical systems.
