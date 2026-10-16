# Slot Keeper

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/slot-keeper/>

After using this, you can now **let people book time with you from a page you host yourself**, offering only the times you are really free, in each visitor's own time zone, with an invitation, a reminder and a cancel or reschedule link, instead of paying a scheduling service per seat or trading emails about times.

Two parts, both free and MIT:

- **`index.html`**: set weekly hours, buffers and notice, paste a calendar, and see the slots a visitor would get in any time zone. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Booking pages, JSON slots API, invitations, reminders, cancel and reschedule, admin, CSV export, a calendar feed of your bookings.

## Why someone would use this

| Today | Cost / catch | Slot Keeper |
|---|---|---|
| Calendly, SavvyCal, Acuity, Zoho Bookings | Priced per seat per month; invitee details live with them; multiple event types, buffers and reminders sit on paid tiers | Your server, unlimited event types and bookings, no seat fee |
| Cal.com and other open-source schedulers | Full platforms: a database, a build, integrations to configure | One Node process and one JSON file |
| "What times work for you?" emails | Slow, double-bookings, muddled time zones, no reminder | One link, only free times, invite and reminder included |

Honest limits: one host per booking page (no round-robin or team routing), it reads your calendar's busy time but does not write to it (subscribe to the bookings feed instead), no video-room creation (paste your meeting link as the location), no payments, no mobile app, one admin key. Recurring events in your calendar feed use the common rules (daily, weekly with days, monthly, yearly, with COUNT, UNTIL, INTERVAL and EXDATE). Rules like "first Monday of the month" count only their first occurrence; keep such a meeting as a day off in the event type.

## How it works

1. **Create an event type** at `/admin` (any user name, `ADMIN_KEY` as the password): name, length, weekly hours in your time zone (`mon-fri 09:00-12:00,13:00-17:00; sat 10:00-12:00`), buffers before and after, minimum notice, how many days ahead, an optional per-day limit, days off, and where it happens (a meeting link or address). You get the booking link `/b/<event>`, a link-or-iframe snippet and the JSON endpoint.
2. **Visitors pick a day and time** in their own zone (changeable on the page) and enter a name and email. Only times that are free *right now* can be booked: the server rechecks at booking, so two people cannot take the same slot, and a forged time is refused. Honeypot and a rate limit stop bots.
3. **Your busy time is respected.** Set `BUSY_ICS_URL` to your calendar's secret iCal address (Google Calendar: Settings, your calendar, "Secret address in iCal format"; Outlook and Apple Calendar have the same). It is read every five minutes, with recurring, all-day and different-zone events handled and daylight-saving changes kept. If the feed fails, the last good copy is used for an hour and `/admin` warns you; after that no times are offered at all, so nobody can book over a meeting you made elsewhere.
4. **Both sides get an invitation** with a calendar file (`METHOD:REQUEST`), a reminder goes out once before the booking (`REMINDER_HOURS`, default 24, `0` to turn off), and cancelling sends a calendar file that removes the entry. Each booking has a private link to cancel, add to calendar or **reschedule**: the old time is kept until the new one is confirmed.
5. **See bookings in your own calendar** by subscribing to `/feed/<secret>.ics` (shown on `/admin`).
6. **Housekeeping**: `RETENTION_DAYS` deletes old bookings; CSV export is spreadsheet-formula safe; `ALERT_WEBHOOK_URL` (Slack/Discord) pings on bookings and cancellations; `EMBED_ORIGINS` lists the sites allowed to put the booking page in an iframe.

## Run it

```sh
cd ventures/slot-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) COMPANY_NAME=Acme DEFAULT_TZ=America/Denver node server.mjs
```

Email starts in **dry run**: bookings are saved but nothing is sent. To send, set `DRY_RUN=false`, `RESEND_API_KEY`, `MAIL_FROM` (an address on a domain you verified with Resend, your own account) and `HOST_EMAIL` (where you want booking notices). `PUBLIC_URL` (https) is required when `DRY_RUN=false`: links in emails and reminders point at your domain, never at whatever Host header a stranger sends. Other settings: `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the booking page and are responsible for the details it collects, your privacy notice, data-protection rules and your own email sending. Check the time and zone of every booking; a missed or double-booked appointment is your responsibility. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
