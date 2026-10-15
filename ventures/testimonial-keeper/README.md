# testimonial-keeper

After using this, you can now **collect customer testimonials with a link, approve the ones you want, and show them as a wall on your own site**, on a server you own. That used to mean a monthly subscription to a testimonial service that keeps your customers' words behind its own login.

Two parts, both free and MIT:

- **`index.html`**: the product page with a live demo of the embeddable wall (clearly labelled sample data). Runs in the browser; nothing is uploaded.
- **`server.mjs`**: the service. One Node process, **zero dependencies**, state in one JSON file. It serves the collection form, an admin page, a JSON API and the embed script.

## Why someone would use this

| Today | Cost / catch | Testimonial Keeper |
|---|---|---|
| Testimonial.to, Senja, Shoutout and similar | Paid tiers gate the number of testimonials, forms or the widget; the data lives with them | Unlimited forms and testimonials, one JSON file you own, no fee |
| A Google Form and copy-paste | No approval flow, no consent record, no widget | Consent tick stored with every entry, approve/hide, embeddable wall, CSV export |
| Screenshots of emails | Not verifiable, no permission, awkward to update | Customer-submitted words, shown only after approval, never edited |

Honest limits: **text only** (no video or image upload), one admin key (no per-user logins), no automatic import from G2, Trustpilot or social posts, no email sending of its own (set `NOTIFY_WEBHOOK` to get a Slack/ntfy ping instead), and no proof that a submitter is a real customer: it records what they typed and that they agreed to publish it.

## What it does

1. **Collection form** at `/t/<slug>`: name, optional role, company, 1-5 rating and email (never published), the testimonial (20-600 characters) and a **required consent tick** to publish. Honeypot field, a per-visitor daily cap (visitor keys are HMAC hashes, kept for the day and not stored with the testimonial) and a double-submit check.
2. **Moderation.** Everything starts *pending* and is invisible. Approve or hide in `/admin` (the admin key is typed into the page and sent as a bearer header; it is never in a URL). The text is never edited, only shown or not.
3. **The wall.** `<script src="https://<host>/embed.js" data-form="main" data-limit="12" data-theme="light" defer></script>` renders approved testimonials inside a shadow root using `textContent` only, so a testimonial cannot inject markup or restyle your page. `GET /wall.json?form=main` is the same data (CORS open) if you want your own layout.
4. **Reports and export.** `GET /v1/summary` (pending, approved, hidden, average rating of approved rated ones), `GET /v1/testimonials.csv` (spreadsheet formulas neutralised).
5. **Notifications.** `NOTIFY_WEBHOOK` receives `{"text": "..."}` for each new submission (works with Slack-compatible and many chat webhooks).

## Run it

```sh
cd ventures/testimonial-keeper
node --test        # 16 tests, no network
ADMIN_KEY=$(openssl rand -hex 16) PUBLIC_URL=https://proof.example.com COMPANY_NAME=Acme node server.mjs
```

A form named `default` is created on first start. Add more:

```sh
curl -s -X POST "$PUBLIC_URL/v1/forms" -H "authorization: Bearer $ADMIN_KEY" \
  -d '{"slug":"launch","title":"How did launch week go?","prompt":"What changed for you?"}'
```

| Env | Purpose |
|---|---|
| `ADMIN_KEY`, `PUBLIC_URL` | required |
| `COMPANY_NAME`, `BRAND_COLOR` | form wording and `#rrggbb` accent |
| `TRUST_PROXY` | `true` behind a reverse proxy so the per-visitor cap uses `X-Forwarded-For` (the Render blueprint sets it) |
| `IP_SECRET` | key for the daily visitor hash (random per start if unset) |
| `NOTIFY_WEBHOOK` | optional https webhook pinged on each submission |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`. `render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB disk and a generated `ADMIN_KEY`. Nothing runs on the author's side. Docker anywhere works: `docker build -t testimonial-keeper . && docker run -p 8080:8080 -v tk:/data -e STATE=/data/state.json -e ADMIN_KEY=... -e PUBLIC_URL=... testimonial-keeper`.

## Status and what is not verified

Everything in `node --test` passes, including the widget run against a fake DOM. It has **not** been tried in real browsers or at real traffic by the author. You are the operator: only publish what people agreed to, do not edit or invent testimonials, and follow the endorsement and review rules where you sell (for example the FTC rules in the US). Do not mark up your own testimonials as third-party review ratings in structured data: search engines treat self-collected reviews that way as self-serving.

Files: `store.mjs` (rules), `widget.mjs` (the embed), `page.mjs` (form and admin), `server.mjs` (HTTP shell), `index.html` (product page).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
