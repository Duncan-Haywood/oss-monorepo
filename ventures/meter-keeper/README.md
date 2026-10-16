# Meter Keeper

Usage metering for small SaaS teams that bill through Stripe. Your app sends
usage events; Meter Keeper counts each exactly once, prices the month, tells
your app when a customer is over a limit, and feeds
[Stripe Billing Meters](https://docs.stripe.com/billing/subscriptions/usage-based)
with retries. MIT, one Node process, no dependencies, state in a JSON file.

Try your pricing on real usage numbers first: open `index.html` (nothing is
uploaded; the page makes no network requests).

## Why use this instead of what you have today

| Today | Problem for a small team | Meter Keeper |
|---|---|---|
| Lago, Orb, Metronome, OpenMeter, Amberflo | Full billing platforms, or per-event fees, or a database cluster to run | One process, one file, no per-event fee. Not a billing platform: Stripe still invoices |
| Stripe Billing Meters alone | Counts and bills, but has no per-customer "what will they owe", no limit check for your app, and a dropped call is a lost charge | Local source of truth, invoice previews, `/v1/check`, a retry queue and a visible dead-letter list |
| A counter in your own database | Double counts on retry, no tiers, rebuilt for every product | Idempotent on event id, four pricing models, tested |

If you need invoicing, tax, proration and a customer portal in one product, use
a billing platform. This is the counting layer for teams that stay on Stripe.

## Run it

```
cp meter-config.example.json meter-config.json
API_KEY=$(openssl rand -hex 16) ADMIN_KEY=$(openssl rand -hex 16) node server.mjs
```

It starts in `DRY_RUN=true`: events are metered and priced locally and nothing
goes to Stripe. Environment:

| Variable | What |
|---|---|
| `API_KEY`, `ADMIN_KEY` | required, 16+ characters; the first is for your app, the second for you |
| `CONFIG` / `CONFIG_JSON` | meters and plans (file path, default `./meter-config.json`; or the JSON inline) |
| `STATE` | state file, default `/tmp/state.json`; put it on a disk |
| `STRIPE_SECRET_KEY` | restricted key allowed to write Billing Meter Events |
| `DRY_RUN` | `false` to send to Stripe |

### Config

A **meter** has an `agg`: `sum` (add the values), `count` (events, value ignored),
`max` (peak value, e.g. storage GB) or `unique` (distinct `key`, e.g. active
users). Add `stripeEvent` to forward it to the Stripe meter of that event name.
A **plan** has an optional `base` and `minimum` (cents) and `lines`, each a
`meter` with a `model`: `flat` (`unit` cents), `graduated`, `volume` (`tiers`
with `upTo` and `unit`, last `upTo: null`), or `package` (`unit` per `size`
units), plus `included` free units and an optional hard `limit`. Tier limits
count units after the included ones. See `meter-config.example.json`.

### API

All `/v1/*` calls take `Authorization: Bearer $API_KEY`.

- `POST /v1/events` with `{id, customer, meter, value?, timestamp?, key?}` or
  `{events: [...]}` (1-100). Per-event status `accepted`, `duplicate` or
  `rejected`. The `id` makes retries safe. Timestamps must be within 35 days
  past and 5 minutes ahead, the window Stripe accepts.
- `GET /v1/usage?customer=&meter=&from=&to=`
- `GET /v1/invoice-preview?customer=` the month so far, in cents
- `GET /v1/projection?customer=` straight-line guess for the full month
- `GET /v1/check?customer=&meter=&quantity=` is this call inside the plan limit?

### SDK (Node 18+, server side)

Your own server serves a tiny client at `/sdk.mjs`. It buffers `track()` calls,
sends them in batches, and retries with the same event ids, so a lost response
cannot double count. It never throws into your request path, and `check()`
fails open if the meter is unreachable.

```js
import { createMeter } from "https://meter.example.com/sdk.mjs";
const meter = createMeter({ url: "https://meter.example.com", key: process.env.METER_API_KEY });
meter.track("acme", "api", 1);
if (!(await meter.check("acme", "api")).allowed) return res.status(402).end();
await meter.close(); // flush on shutdown
```

Keep the key on the server: it can read every customer's usage.

Admin calls take `$ADMIN_KEY`: `PUT /v1/admin/customers/:id` with
`{plan, stripeCustomerId}`, `GET /v1/admin/customers`, `GET /v1/admin/outbox`
(pending and dead-lettered Stripe events), `POST /v1/admin/flush`,
`GET /v1/admin/export.csv`.

### Limit alerts

Set `ALERT_WEBHOOK_URL` (and `ALERT_WEBHOOK_SECRET`) and the server POSTs JSON
to your URL the first time a customer reaches 80% and 100% of a plan line's
`limit` in a month (`"alerts": {"at": [0.5, 0.9, 1]}` in the config changes the
thresholds). One alert per customer, meter, month and threshold. Body:
`{type: "usage.threshold", customer, plan, meter, threshold, used, limit, month, resetsAt}`.
`x-meter-signature: sha256=<HMAC-SHA256 of the raw body>` is sent when a secret
is set; verify it before trusting the call. Failed deliveries retry with
backoff, then land in the dead-letter list. Without a URL, no alerts are kept.

### Stripe

Create a Billing Meter whose event name matches `stripeEvent`, with `sum`
aggregation (a `unique` meter forwards one event per key per month, value 1).
The event id is sent as Stripe's `identifier`, so a retry cannot double count.
Events that cannot be delivered (customer without a `stripeCustomerId`, Stripe
4xx) land in the dead-letter list; check it at least weekly, because Stripe
drops events older than 35 days.

## One-click deploy

Fork this repository, then open
`https://render.com/deploy?repo=<your fork URL>` (the blueprint is
`render.yaml`; Render bills you, nothing runs on the author's account). Or use
the repository-wide deploy page. Docker: `API_KEY=$(openssl rand -hex 16)
ADMIN_KEY=$(openssl rand -hex 16) docker compose up -d` from this directory
(`docker-compose.yml`, starts in dry-run). Fly.io: the steps are at the top of
`fly.toml`.

## Limits

State is one JSON file rewritten on every write: fine for thousands of events a
day, not for millions. Events within the last 14 months are kept as per-day
totals, not individually. There is no tax, proration or invoicing. Invoice
previews are calculations from what this server saw, not invoices.

## Tests

`node --test`

## Disclaimer

Free and MIT, provided as-is with no warranty and no uptime guarantee. You run
it, so you are responsible for what you charge, for backups and for your
customers' privacy: send ids you choose, not names or emails. Not legal, tax or
financial advice. If it helps, [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
