# Slot Keeper

After using this, you can now **let people book time with you from a page you host yourself**, with your hours, buffers, reminders and reschedule links, instead of paying a scheduling service per seat or trading emails to find a time.

Two parts, both free and MIT:

- **`index.html`**: set your weekly hours, meeting length and buffer, optionally paste a calendar (`.ics`), and see the bookable times a visitor in another time zone would get. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Public booking pages, admin, emails, calendar file, JSON slots endpoint.

## Why someone would use this

| Today | Cost / catch | Slot Keeper |
|---|---|---|
| Calendly, SavvyCal, Acuity | Priced per seat per month; several meeting types, reminders and removing branding sit on paid tiers; invitee details live with them | Your server, unlimited meeting types and bookings, no seat fee |
| Cal.com and other open-source schedulers | Full platforms: database, background jobs, lots to operate | One Node process and one JSON file |
| Email back-and-forth | Slow, and invites double-booking | Visitors pick from times that are actually free |

Honest limits: one calendar and one admin key (no team round-robin, no separate logins), no payments, no video-meeting links created for you (paste yours into the meeting's location), no mobile app, calendar feed refreshed every five minutes. For a team that needs routing and payments use a full scheduler.

## How it works

1. **Set your availability** at `/admin` (any user name, `ADMIN_KEY` as the password): time zone, weekly hours (`mon-fri 09:00-12:00, 13:00-17:00`, `sat closed`), days off, and optionally the secret `.ics` address of your Google, Outlook or Apple calendar so existing events block time (repeating events and all-day events included).
2. **Add meeting types**: length, buffer on both sides, start times every N minutes, minimum notice, how many days ahead, a daily cap, reminder timing, a location or meeting link, and optional hours of its own (for example Tuesday office hours). Each gets a link, `/e/<name>`, and an iframe snippet for your site.
3. **Visitors pick a time** shown in their own zone (detected from the browser, changeable on the page), enter a name and email, and confirm. The server recomputes availability at that moment, so two people cannot take the same slot. An address can hold at most three upcoming bookings, and a honeypot field and a per-address rate limit slow bots.
4. **Both sides get email** (see below): a confirmation with an add-to-calendar file and a private link (`/b/<token>`) to move or cancel, a note to you for each booking, and a reminder to the invitee. A Slack or Discord webhook can ping you too.
5. **Time zones are handled with the platform's own database.** Hours are wall-clock times in your zone, so 09:00 stays 09:00 across a clock change; times that do not exist on the spring-forward night are skipped rather than shifted; the repeated autumn hour takes the first. The tests cover the New York changes.
6. **Build your own front end** with `GET /api/slots/<meeting>?from=2026-10-19&days=14&tz=Europe/Berlin`, which returns ISO times.

## Run it

```sh
cd ventures/slot-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) HOST_NAME="Ann Coaching" HOST_TZ=America/New_York node server.mjs
```

Email starts in **dry run**: nothing is sent. To send, set `DRY_RUN=false`, `RESEND_API_KEY` and `MAIL_FROM` (an address on a domain you verified with Resend, your own account). Optional: `PUBLIC_URL` (used in email links; set it behind a proxy), `EMBED_ORIGINS` (space-separated site origins allowed to frame the booking pages), `ALERT_WEBHOOK_URL` (Slack/Discord, https), `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`, `RETENTION_DAYS` (delete old bookings). `HOST_NAME` and `HOST_TZ` seed the first start; after that edit them in `/admin`.

The calendar feed address is fetched by the server, only over https and never to a private or loopback address, with redirects refused, a 10 second timeout and a 5 MB cap. Treat the secret address like a password.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the booking page and are responsible for the details it collects, your privacy notice, data-protection rules and your own email sending. Check the time and time zone before you rely on a booking. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
