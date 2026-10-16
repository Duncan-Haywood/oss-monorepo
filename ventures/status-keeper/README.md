# status-keeper

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/status-keeper/>

After using this, you can now **publish a status page that stays up when your
app goes down**, with uptime checks, 90-day bars, incident updates and alerts,
on your own server, which used to mean paying Statuspage, Instatus or Better
Stack per seat or per subscriber, or running a heavier self-hosted stack.

Two parts, both free and MIT:

- **`index.html`**: a downtime-budget calculator (what 99.9% really allows) and
  a monitor-config builder. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: the monitor and the public page. One Node 22 process,
  **zero dependencies**, state in one JSON file.

## Why someone would use this

| Today | Cost / catch | status-keeper |
|---|---|---|
| Atlassian Statuspage, Instatus, Better Stack | Monthly fee that climbs with subscribers and seats | Runs in your account, no per-seat or per-subscriber fee |
| Uptime Kuma | Powerful, but a full app with a private UI and no customer-facing incident timeline | A public page, incident updates, Atom feed and badge from one small file |
| Upptime and static generators | Checks run on a CI schedule, minutes apart, and burn Actions minutes | A real 60-second loop on a server you control |

Honest limits: one process on one host, so host it somewhere other than what it
watches. It checks from one location, so it cannot tell a regional outage from
its own network trouble. Email subscribers need your own Resend key (off until
you set it; no SMS or per-component subscriptions), and it has no TLS
certificate expiry check, no multi-region probes, no custom domain handling
(point your DNS at it yourself) and no per-component incident history.

## What it does

1. **HTTP checks.** GET (or `method`) a URL every `intervalSec` (default 60s),
   up to `timeoutMs` (10s). Healthy means status below 400, or one of
   `expectStatus` if you list them, and, if you set `contains`, that text in the
   body. Redirects are not followed, so a login redirect is not a pass.
2. **Heartbeat checks** for cron jobs: `{"id":"backup","type":"push","token":"<12+ chars>","intervalSec":86400}`.
   The job calls `POST /ping/backup?token=...`. A ping later than
   `intervalSec + graceSec` marks it down. Silent until the first ping.
3. **No false alarms.** An incident opens only after `failAfter` failures in a
   row (default 2) and is dated from the first one. Recovery closes it.
4. **Incidents and maintenance.** Post updates by hand through the admin API;
   auto-opened incidents resolve themselves. Checks inside a maintenance window
   are not counted in uptime and cannot open an incident.
5. **Publishing.** `/` status page (server-rendered, no JavaScript, 90-day bars),
   `/api/status.json` (CORS open), `/feed.xml` (Atom) and `/badge.svg`.
6. **Alerts.** Down and recovery messages go to stdout and, if set,
   `ALERT_WEBHOOK_URL`.
7. **Email subscribers (optional).** Set `RESEND_API_KEY`, `MAIL_FROM` (a sender
   you verified with Resend) and an https `PUBLIC_URL`, and the page grows a
   subscribe form. Double opt-in (a confirmation link, expiring in 48 hours),
   then a plain-text email when an incident opens, updates or resolves and when
   maintenance is scheduled, each with `List-Unsubscribe` one-click headers.
   Unsubscribing needs a POST, so link scanners cannot do it for anyone. The form
   answers the same for known and new addresses, has a honeypot field, resends
   a confirmation at most hourly per address, and caps confirmation emails at 30
   an hour and the list at 5,000. `GET /v1/subscribers` (admin key) returns the
   counts. Subscriber addresses live only in your state file. Without the two
   keys none of these routes exist.

## Certificate and domain expiry watchers

Two more monitor types catch the outage that is entirely avoidable: the
certificate or the domain registration lapsing.

```
{"id":"site-cert","name":"example.com certificate","type":"tls","host":"example.com","port":443}
{"id":"site-domain","name":"example.com registration","type":"domain","domain":"example.com","warnDays":[60,30,14,7,1]}
```

- `tls` connects to `host:port`, reads the certificate the server presents and
  fails (opening an incident and counting against uptime) only when it is
  expired, does not match the name or is not trusted. `"strict": false` accepts
  an untrusted chain, for internal CAs.
- `domain` asks RDAP (`rdap.org`, which forwards to the registry) for the
  registration's expiration date. Not every registry runs RDAP: a TLD without
  it reports "not found" rather than guessing.
- Both check every 6 hours (`intervalSec`), fail on the first miss
  (`failAfter` 1) and, on every pass, compare days left with `warnDays`
  (default 30, 14, 7, 3, 1). Each threshold alerts **once** on
  `ALERT_WEBHOOK_URL`; a renewal sends one "renewed" message and re-arms the
  warnings. A certificate with 5 days left is still serving, so a warning is not
  an incident and does not dent the uptime bars.
- The public page and `/api/status.json` show the expiry date and days left
  (`expiresAt`, `daysLeft`).

Not verified: RDAP answers were exercised against recorded-shape fixtures, not
a live registry; the TLS probe is tested against a local self-signed server.

## Run it

```
ADMIN_KEY=$(openssl rand -hex 16) TITLE="Acme" \
MONITORS_JSON='[{"id":"site","name":"Website","url":"https://example.com"},{"id":"api","name":"API","url":"https://api.example.com/health","contains":"ok"}]' \
node server.mjs
```

| Variable | Meaning |
|---|---|
| `ADMIN_KEY` | required; bearer token for `/v1/*` |
| `MONITORS_JSON` | required; array of monitors (above) |
| `TITLE`, `PUBLIC_URL` | page title; absolute URL used in the feed |
| `STATE` | path of the JSON state file (mount a disk here) |
| `RESEND_API_KEY`, `MAIL_FROM` | optional; both or neither. Turns on email subscriptions |
| `ALERT_WEBHOOK_URL` | Slack or Discord compatible incoming webhook |
| `PORT` | default 8080 |

Admin API (all need `Authorization: Bearer $ADMIN_KEY`):

```
POST /v1/incidents               {"title","impact":"minor|major","message","monitors":[]}
POST /v1/incidents/<id>/updates  {"status":"investigating|identified|monitoring|resolved","message"}
POST /v1/maintenance             {"title","startsAt":"2026-11-01T02:00:00Z","endsAt":"...","monitors":[]}
```

Deploy: Docker (`docker build -t status-keeper . && docker run -p 8080:8080 -e ...`)
or the one-click Render blueprint in `render.yaml` (it builds in your account).

## Tests

```
node --test ventures/status-keeper/*.test.mjs
```

## Disclaimer

Free and as-is, no warranty, no uptime guarantee. A monitor can miss an outage
shorter than its check interval. You are responsible for what you publish.
Donations: https://github.com/sponsors/Duncan-Haywood

## Other self-deploy paths

`docker-compose.yml` runs it on any box with Docker (the command is at its top). Fly.io: the steps are at the top of `fly.toml`. Both keep state on a volume and run in your own account.
