# Drip Keeper

After using this, you can now **send onboarding, trial and win-back email
sequences triggered by what your customers do, and stop them the moment they
convert**, from one small server you run, instead of paying a lifecycle-email
tool a fee that grows with your contact list.

**Live tool:** https://duncan-haywood.github.io/monorepo-projects/drip-keeper/

Two parts, both free and MIT:

- **`index.html`**: a timeline simulator. Paste your sequences, list what one
  person does ("0h signed_up, 60h created_project, 200h upgraded") and see
  every email they would get, when, and which ones are skipped or cancelled.
  It runs the same `engine.mjs` as the server, in your browser; nothing is
  uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON
  file. Your app posts events; it sends the emails through your own Resend
  account.

## Why someone would use this

| Today | Cost / catch | Drip Keeper |
|---|---|---|
| Customer.io, Loops, Userlist, Encharge, Mailchimp automations | Priced by contact count; your customer list and event stream live with them | Your server and sending account, no per-contact fee |
| Listmonk and other open-source newsletter tools | Broadcasts, not "four emails after signup, stop on upgrade" | Event-triggered sequences with exit-on-goal and skip rules |
| Mautic, Dittofeed | Full marketing platforms: a database, a queue, a lot to operate | One process, one JSON file |
| A cron job and a `sent_emails` table | Free, but every team rewrites unsubscribe, retries, "did they already upgrade", and outage catch-up | Done, with tests |

Honest limits: no visual editor (sequences are JSON), no open or click
tracking (by design: no tracking pixels), no A/B tests, no segments beyond
"did this event happen", one sending provider (Resend), state is a single JSON
file (fine for tens of thousands of contacts, not millions), bounces and
complaints are handled automatically through a Resend webhook; for other cases
suppress addresses with the admin endpoint).

## How sequences work

```json
{ "id": "onboarding", "trigger": "signed_up", "exitOn": ["upgraded"],
  "sendHoursUTC": [13, 21], "reenroll": false,
  "steps": [
    { "waitHours": 0,  "subject": "Welcome, {{name|there}}", "text": "Hi {{name|there}}, ..." },
    { "waitHours": 48, "subject": "Stuck?", "text": "...", "skipIf": "created_project" } ] }
```

- **`trigger`**: the event that enrolls a contact. Once per contact unless
  `reenroll` is true and the earlier run has ended.
- **`exitOn`**: events that end the sequence for that contact (the goal).
- **`waitHours`**: counted from enrollment, cumulatively, so an outage does not
  push every later email back.
- **`skipIf`**: skip this step if the contact has done that event since they
  enrolled.
- **`sendHoursUTC`**: only send between these UTC hours (wraps midnight).
- **Placeholders**: `{{name}}`, `{{email}}`, `{{plan|free}}` (default after `|`)
  from the `props` you send. `{{unsubscribe_url}}` is available, but an
  unsubscribe link and your postal address are always added.
- **Safety:** after downtime it sends at most one message per contact per pass
  and keeps at least an hour between messages. A message is marked sent and
  saved before the provider call, so a crash can lose one email but never send
  it twice. Failures retry with backoff, four times, then that step is dropped
  and the sequence moves on.

`examples/sequences.json` has a four-email onboarding sequence and a win-back.

## Run it

```sh
cd ventures/drip-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) SEQUENCES_FILE=examples/sequences.json \
  BASE_URL=http://localhost:8080 PRODUCT_NAME=Acme node server.mjs
```

It starts in **dry run**: events and enrollments are recorded, nothing is sent
and nothing advances. `POST /v1/admin/tick` shows what would go out.

```sh
curl -X POST localhost:8080/v1/events -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"email":"ada@example.com","name":"Ada","event":"signed_up","props":{"plan":"trial"}}'
curl -X POST localhost:8080/v1/admin/tick -H "Authorization: Bearer $ADMIN_KEY"
```

To go live set `RESEND_API_KEY`, `MAIL_FROM`, `POSTAL_ADDRESS` and
`DRY_RUN=false`, and point your sending domain's SPF/DKIM at Resend.

| Endpoint (Bearer key) | Purpose |
|---|---|
| `POST /v1/events` `{email, event, name?, props?}` | record an event; enroll or exit (ingest key or admin key) |
| `POST /v1/contacts` `{email, name?, props?}` | create or update a contact |
| `GET /v1/admin/stats` | per sequence: enrolled, active, completed, exits by event, per step sent / skipped / failed / **exitedAfter** |
| `GET` / `PUT /v1/admin/sequences` | read, or replace and validate, all sequences |
| `POST /v1/admin/tick` | run a pass now (a timer runs one every 60 s) |
| `POST /v1/admin/suppress` `{email, reason}` | stop all mail to a bounced or complaining address |
| `GET` / `DELETE /v1/admin/contacts/:email` | inspect, or erase on request |
| `GET /v1/admin/export.csv` | contacts and sequence status |
| `POST /v1/webhooks/resend` | Resend webhook (signed): complaints and permanent bounces suppress the address; off until `RESEND_WEBHOOK_SECRET` is set |
| `POST /v1/webhooks/stripe` | Stripe webhook (signed): `checkout.session.completed` becomes `purchased`, a subscription's first `invoice.paid` becomes `subscribed`, `invoice.payment_failed` becomes `payment_failed`, `customer.subscription.deleted` becomes `canceled`; so `"exitOn": ["subscribed"]` stops trial emails when they pay and `"trigger": "canceled"` starts a win-back, with no code in your app. Off until `STRIPE_WEBHOOK_SECRET` is set |
| `GET` / `POST /u/:token` | signed unsubscribe page; POST is the RFC 8058 one-click |

| Env | Purpose |
|---|---|
| `ADMIN_KEY` | required, 16+ characters |
| `RESEND_WEBHOOK_SECRET` | optional `whsec_...` signing secret of a Resend webhook pointed at `BASE_URL/v1/webhooks/resend` (events `email.bounced`, `email.complained`); stops mail to those addresses automatically |
| `STRIPE_WEBHOOK_SECRET` | optional `whsec_...` signing secret of a Stripe webhook endpoint at `BASE_URL/v1/webhooks/stripe` (events above). Your own Stripe account; Drip Keeper only reads the events and stores the customer id |
| `INGEST_KEY` | optional key that can only post events and contacts, for your app |
| `BASE_URL`, `PRODUCT_NAME`, `POSTAL_ADDRESS` | unsubscribe links and the footer |
| `SEQUENCES_FILE` | sequences loaded on first start (afterwards the state file wins; use `PUT`) |
| `DRY_RUN` | `true` (default) sends nothing |
| `RESEND_API_KEY`, `MAIL_FROM` | needed when `DRY_RUN=false` |
| `UNSUB_SECRET` | signs unsubscribe links (defaults to `ADMIN_KEY`; changing it breaks old links) |
| `STATE`, `TICK_SECONDS`, `TRUST_PROXY` | state path, pass interval, trust `X-Forwarded-For` behind a proxy |

Call `/v1/events` from your **backend**, never from a browser: the key must
stay secret.

## One-click deploy (your own account)

- **Render:** fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
  `render.yaml` builds the `Dockerfile` here in **your** account with a 1 GB
  disk for state and a generated `ADMIN_KEY`.
- **Fly.io:** steps in `fly.toml` (one machine that never auto-stops, because a
  stopped server cannot send scheduled email).
- **Any Docker host:** `docker compose up -d` (see `docker-compose.yml`).

Nothing runs on the author's side. Put it behind HTTPS.

## Status and what is not verified

`node --test` covers the engine (enrollment, schedule maths, exit-on-goal,
skip rules, send windows, outage catch-up, retries, suppression, rendering and
escaping) and the HTTP server end to end with a fake mailer. The simulator page
was run in a real browser (Chromium). No real email has been sent through
Resend and deliverability (SPF, DKIM, reputation) is yours to set up. You are
the sender: consent, privacy notice and anti-spam law where you and your
recipients live (for example CAN-SPAM's postal-address rule and GDPR consent)
are your responsibility, and this is not legal advice.

Related ventures, same buyer: [waitlist-keeper](../waitlist-keeper/),
[feedback-board](../feedback-board/), [trial-converter](../trial-converter/),
[dunning-engine](../dunning-engine/), [status-keeper](../status-keeper/).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
