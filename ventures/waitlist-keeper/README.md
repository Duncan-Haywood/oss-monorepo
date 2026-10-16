# waitlist-keeper

**Live tool:** <https://duncan-haywood.github.io/monorepo-projects/waitlist-keeper/>

After using this, you can now **run a pre-launch waitlist where confirmed
referrals move people up the line, with the signup list in your own account**,
which used to mean paying a waitlist tool per subscriber or writing the
anti-abuse plumbing yourself.

Two parts, both free and MIT:

- **`index.html`**: paste an email list to find aliases, duplicates and
  disposable addresses, and project referral growth. Runs in the browser;
  nothing is uploaded.
- **`server.mjs`**: the waitlist. One Node process, **zero dependencies**, state
  in one JSON file. Works with JavaScript switched off.

## Why someone would use this

| Today | Cost / catch | Waitlist Keeper |
|---|---|---|
| Viral Loops, Prefinery, Waitlister, Launchrock | Usually priced by subscriber count or campaign; the list lives on their platform | Runs in your account, no per-subscriber fee, CSV export any time |
| A form plus a spreadsheet | Free, but no referral loop, and `a.b+x@gmail.com` and `ab@gmail.com` are counted as two people | Canonical emails, confirmation, a share link and a place in line |
| Your own script | Referral credit without confirmation is farmed in an afternoon | Confirmation-gated credit, caps, same-network rule, disposable-domain block |

Honest limits: one waitlist per instance, no custom branding beyond product
name and tagline, no A/B testing, no social-login signups. The anti-gaming
rules raise the cost of cheating; they do not stop a determined person with
many networks. It has **not been run in production by the author**.

## How the line works

- Ranked by join order among **confirmed** people. Each confirmed referral moves
  the referrer up `BOOST` places (default 5). Invited people leave the queue.
- A referral counts only after the friend confirms their own email. A friend on
  the same network address as the referrer earns nothing. A referrer stops earning
  at `CAP` referrals (default 25).
- Emails are canonicalised: case, `+tags`, Gmail dots and `googlemail.com` all
  collapse to one person. A small list of disposable domains is refused.
- Optional reward tiers (`TIERS_JSON='[{"referrals":3,"reward":"early access"}]'`)
  show on each person's status page.
- People can delete themselves from the link in every email and on their status
  page (the GET only shows a button, so mail scanners that prefetch links erase
  nothing). Network addresses are stored only as a salted hash, used to spot a
  referrer signing up their own friends.
- The status page (`/s/<code>`) shows only the visitor's own place; it never
  shows an email.

## Run it

```sh
cd ventures/waitlist-keeper
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) BASE_URL=http://localhost:8080 PRODUCT_NAME=Acme node server.mjs
```

It starts in **DRY_RUN** (default): no email is sent and the confirm link is
printed on the page so you can try the flow.

| Call (admin: `Authorization: Bearer $ADMIN_KEY`) | Does |
|---|---|
| `GET /v1/admin/stats` | signups, confirmed, waiting, invited, referral rate |
| `GET /v1/admin/export.csv` | full list with positions (formula-injection safe) |
| `POST /v1/admin/invite {"count": 50, "url": "..."}` | invites the front of the line and emails them |
| `GET /v1/count` (public) | number waiting, for social proof on your own site |
| `POST /v1/admin/erase {"email": "..."}` | delete one person (a data-deletion request) |
| `POST /join` (form or JSON `{email, ref, src}`) | sign up, from your own form too; `src` (or `?utm_source=`) records where they came from |
| `GET /admin` (browser, any user name, `ADMIN_KEY` as password) | read-only dashboard: counts, signups per source, top referrers |
| `GET /embed.js` | drop-in form for any site: `<div id="waitlist-keeper" data-src="launch-post"></div><script src="https://your-server/embed.js" async></script>` |
| `GET /leave?t=<token>` | the "delete my data" page linked from every email and status page; the button erases |

| Env | Purpose |
|---|---|
| `ADMIN_KEY` | required, 16+ characters |
| `BASE_URL`, `PRODUCT_NAME`, `TAGLINE` | links in emails; page text |
| `BOOST`, `CAP`, `TIERS_JSON` | referral rules |
| `INVITE_URL` | where invite emails point |
| `DRY_RUN` | `true` (default) sends nothing |
| `RESEND_API_KEY`, `MAIL_FROM` | needed when `DRY_RUN=false` |
| `STATE` | path of the JSON state file |

## One-click deploy (your own account)

Fork this repository and open `https://render.com/deploy?repo=<your fork URL>`.
`render.yaml` builds the `Dockerfile` here in **your** Render account with a 1 GB
disk for the state file and generates `ADMIN_KEY`. Nothing runs on the author's
side. Docker anywhere works too (`docker-compose.yml`, starts in dry-run). Fly.io: the steps
are at the top of `fly.toml`. Put it behind HTTPS (Render and Fly do).

## Status and what is not verified

`node --test` covers the engine and the HTTP server end to end with a fake
mailer (join, confirm, referral credit, tiers, honeypot, rate limit, invites,
CSV). No real email has been sent and the pages have not been checked in a
real browser or with a screen reader. You are the operator: privacy notice,
consent and anti-spam rules where you and your subscribers live are yours.

Related ventures, same buyer: [feedback-board](../feedback-board/),
[license-keeper](../license-keeper/), [status-keeper](../status-keeper/),
[mrr-pulse](../mrr-pulse/).

Support the project: <https://github.com/sponsors/Duncan-Haywood>.
