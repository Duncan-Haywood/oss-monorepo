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

Files: `cron.mjs` (parser, next-run, evaluate), `monitor.mjs` (alert state
machine), `crontab.mjs` (crontab → entries/config), `server.mjs` (HTTP shell),
`usage.mjs` (opt-out local counters).

Limits, stated plainly: UTC only; five-field cron plus `@daily`-style macros
(no `@reboot`, no `L`/`W`/`#`); no email alerts or UI in this version; the
monitor is a single process, so run it on a different machine from the jobs
it watches. Not a substitute for real alerting on critical systems.
