# webhook-relay

After using this, you can now **stop losing webhooks when your app is down,
mid-deploy or crashing**: every event is verified, saved to disk, delivered
with retries and backoff, and replayable by hand, on your own server, which
used to mean paying a webhook gateway per event or writing a queue yourself.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/webhook-relay/

Two parts, both free and MIT:

- **`index.html`**: an outage simulator (how long can your app be down before
  an event is parked?) and a route-config builder. Runs in the browser;
  nothing is uploaded.
- **`server.mjs`**: the relay. One Node 22 process, **zero dependencies**, state
  in one JSON file, a dashboard at `/admin`.

## Why someone would use this

| Today | Cost / catch | webhook-relay |
|---|---|---|
| Point providers straight at your app | Down for a deploy or a crash means events lost or at the mercy of the sender's retry policy (some providers never redeliver) | Answers the sender at once, keeps the event, retries against your app |
| Hookdeck, Svix Ingest, Convoy Cloud and similar | Paid per event or per seat; your payloads pass through a third party | Runs in your account, no per-event fee, nobody else sees the payloads |
| A queue you build into your app | Dies with your app; needs its own tooling to inspect and replay | Sits in front of the app; dashboard and replay included |

Honest limits: one process and one disk, so it is not a high-availability
service, and it is built for hundreds to low thousands of events a day, not
millions (state is one JSON file, capped at 5,000 events). Delivery is
at-least-once. It does not transform payloads yet (it can filter and rate limit, below).

## What it does

1. **Verifies the sender.** Schemes: `stripe`, `github`, `shopify`, `slack`, `paddle` (Billing), `typeform`, `gitlab`, `woocommerce`, `linear`, `mailgun`, `bitbucket`,
   `standard` ([Standard Webhooks](https://www.standardwebhooks.com/): Svix,
   Resend, Clerk and others), `hmac-sha256` (hex digest in a header you name),
   `none`. Bad signatures get a 401 and are never stored. Timestamped schemes
   reject anything more than five minutes off.
2. **Saves before answering.** The event (exact bytes, headers) is written to
   disk before the sender gets its 200, so an accepted event survives a restart.
   Events carrying a provider id (`webhook-id`, `x-github-delivery`,
   `x-shopify-webhook-id`, `x-gitlab-event-uuid`, `x-wc-webhook-delivery-id`,
   `linear-delivery`, `idempotency-key`, or a Stripe-shaped `id`+`type`)
   are de-duplicated.
3. **Delivers with backoff.** POSTs the original bytes and headers to the
   route's `target` with `x-relay-event-id` and `x-relay-attempt` added, so your
   app can verify the original signature itself and dedupe on the id. 2xx is
   done. 408, 425, 429, 5xx and network errors retry at 10s, 1m, 5m, 30m, 2h,
   6h, 12h, 24h (honouring `Retry-After`, capped at a day). Any other 4xx means
   your app refused it, so the event is parked **dead** instead of hammering.
4. **Fans out.** Give a route `"targets": ["https://a", "https://b"]` (up to 10)
   instead of `target` and each event is delivered to every URL as its own
   record, with its own retries, dead state and replay, so one broken consumer
   never blocks or re-sends to the others.
5. **Filters.** Forward only what you care about. A route (or a single fan-out
   target, written `{"url": "...", "filter": {...}}`) takes a `filter` on a
   JSON field (`{"path": "type", "in": ["invoice.*"]}`) or a header
   (`{"header": "x-github-event", "in": ["push"]}`); `*` at the end of an entry
   matches a prefix, `"not": true` inverts, and an array means all must hold.
   A filtered event is still signature-checked and answered 200 so the sender
   stops retrying, but is not stored or delivered.
6. **Rate limits.** `"rateLimitPerMinute": 60` on a route (or on one fan-out
   target) caps delivery attempts to that URL per rolling minute, so a burst or
   a bulk replay cannot flatten a small receiver. Events over the cap wait their
   turn; waiting costs no retry budget.
7. **Adds headers.** `"headers": {"Authorization": "Bearer ${APP_TOKEN}"}` on a
   route (or on one fan-out target; target wins) is sent with every delivery,
   for receivers that want their own auth. `${NAME}` is read from the relay's
   environment at start (a missing variable stops the relay), so the secret
   never sits in `ROUTES_JSON` or the state file. Relay-owned headers
   (`host`, `x-relay-*`, `content-length`...) cannot be overridden.
8. **Alerts and replays.** A dead event posts to `ALERT_WEBHOOK_URL` (Slack and
   Discord compatible). Replay any event from `/admin` or
   `POST /v1/events/<id>/replay`; it gets a fresh retry budget and its history
   is kept. After an outage, **Replay all dead** in `/admin` (or
   `POST /v1/replay`, optionally `?route=stripe`) revives every dead event,
   oldest first; delivered events are never re-sent.

## Run it

```
cd ventures/webhook-relay
ADMIN_KEY=$(openssl rand -hex 16) \
ROUTES_JSON='[{"name":"stripe","scheme":"stripe","secret":"whsec_...","target":"https://app.example.com/hooks/stripe"}]' \
STATE=./state.json node server.mjs
```

Point the sender at `https://<relay-host>/in/stripe`. Dashboard:
`/admin` (type the admin key; it stays in the tab's sessionStorage). API, all
with `Authorization: Bearer $ADMIN_KEY`: `GET /v1/summary`, `GET /v1/metrics` (Prometheus text: events per route and status, age of the oldest waiting event, for alerting),
`GET /v1/events?status=dead&route=stripe`, `GET /v1/events/<id>` (includes the
body), `POST /v1/events/<id>/replay`, `DELETE /v1/events/<id>`.

**Deploy to your own account** (nothing of the author's runs in between):

- **Render:** fork the repository, then in Render choose New, Blueprint, pick
  your fork and set the Blueprint file path to
  `ventures/webhook-relay/render.yaml` (Render's own `?repo=` deploy link only
  finds a `render.yaml` at the repository root). It asks for `ROUTES_JSON` and
  bills you for the starter plan plus a 1 GB disk.
- **Fly.io:** the steps are at the top of `fly.toml`.
- **Any Docker host:** `ADMIN_KEY=$(openssl rand -hex 16) ROUTES_JSON='[...]'
  docker compose up -d` with `docker-compose.yml`, or `docker build` and mount
  a volume at the directory in `STATE`.

Without a persistent disk events are lost on restart.

Put TLS in front (Render and most hosts do). Treat `ROUTES_JSON` as a secret: it
holds signing secrets. Authorization and cookie headers are never stored or
forwarded.

## Tests

`node --test ventures/webhook-relay/*.test.mjs`. They cover the retry state
machine, every verifier against independently computed signatures, and a real
HTTP receiver that fails twice and then succeeds.

## Disclaimer

No warranty, no uptime or delivery guarantee. You operate it and you are
responsible for the data that passes through. MIT. Support the author:
<https://github.com/sponsors/Duncan-Haywood>
