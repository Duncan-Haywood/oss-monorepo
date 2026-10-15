# Form Inbox

After using this, you can now **point any HTML form at your own server and get an inbox, spam filtering and notifications**, instead of paying a form service a monthly fee that grows with your submissions and sending your visitors' messages through it.

Two parts, both free and MIT:

- **`index.html`**: paste a submission and see its spam score and the reasons. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Form endpoints, an admin inbox, CSV export and notifications.

## Why someone would use this

| Today | Cost / catch | Form Inbox |
|---|---|---|
| Formspree, Basin, Getform, Web3Forms | Hosted; metered per month; spam tools and exports on higher tiers; messages live with them | Your server, unlimited forms, all included |
| Netlify Forms and other host features | Tied to one host | Any static host; one endpoint URL |
| A homemade mail script | You secure and maintain it; no inbox, review or export | Tested, escaped, rate limited, with an admin inbox |

Honest limits: no file uploads, no autoresponder to the visitor, one admin key (no per-user logins), and heuristic spam scoring, not a trained model.

## Use it

```html
<form action="https://your-server/f/<form id>" method="post">
  <input name="name"> <input name="email" type="email"> <textarea name="message"></textarea>
  <input name="_gotcha" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">
  <button>Send</button>
</form>
```

Create forms at `/admin` (any user name, `ADMIN_KEY` as the password). JSON works too: `POST /f/<id>` with `Content-Type: application/json`. Fields starting with `_` are control fields and are not stored: `_gotcha` is the honeypot, and `_ts` (milliseconds since epoch when the page loaded) lets the server penalise instant submissions.

Per form you can set **allowed sites** (browsers on other sites are refused), a **thank-you URL** (only ever the one you configured, so it cannot be used as an open redirect) and an **email address** for notifications.

## Spam scoring

Score 0 to 100, spam at 50 or more. Signals: filled honeypot (decisive), submitted under 2 s after load, more than 2 / 5 links, spam phrases, mostly capitals, malformed or disposable email, identical to a submission in the last hour, empty. Flagged entries go to the Spam tab with their reasons, never notify, and the sender still sees a normal success. Mark any entry spam or not spam by hand. Posts are limited to 10 a minute per address per form; addresses are held in memory only and never written to disk.

## Run it

```sh
cd ventures/form-inbox
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) COMPANY_NAME=Acme node server.mjs
```

API: `GET /admin/f/<id>.csv` (spreadsheet-formula-safe CSV export, same key as `Authorization: Bearer ...`).

Optional: `ALERT_WEBHOOK_URL` (Slack/Discord, https) pings on each real submission; `RESEND_API_KEY` + `MAIL_FROM` email the address set on a form, starting in dry-run (`DRY_RUN=false` turns real email on). Other settings: `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `PUBLIC_URL`, `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`. The newest 5,000 submissions are kept.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. The same Dockerfile runs on Fly.io, Railway or any VPS. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the forms and are responsible for the messages collected, your privacy notice and data-protection rules. The spam score can be wrong either way. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
