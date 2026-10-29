# Self-hosted Sales Agent (M4a, M4b, M4c)

A small server you run yourself. It reads **your** mailbox over IMAP, reads each
new reply the way the inbox agent does ([`../README.md`](../README.md)), stops,
pauses and suppresses on its own, and shows the drafts in an approval queue. You
approve, edit or reject; every decision goes into an append-only audit log. Your
mailbox password goes from your environment to your mail server and nowhere else:
no hosted service of ours is involved.

**Sending is off until you set `SMTP_HOST` (M4b).** The mailbox is still opened with
`EXAMINE` and read with `BODY.PEEK` (nothing marked read, moved or deleted; tested).
With SMTP set, an approved draft gets a **Send from your mailbox** button. Only that
click sends, and only: one message per draft (never twice), to the address that
wrote in, as a reply (`In-Reply-To`), with `List-Unsubscribe: <mailto:you?subject=unsubscribe>`,
never to an address on the suppression list, at most `SEND_MAX_PER_DAY` (20) a day,
with the server's answer or error in the audit log (password redacted). There is no
timer, loop or batch send: automatic sending is M5 and waits on the owner
([`../ROADMAP.md`](../ROADMAP.md)). A test fails if a second call site appears.

## Run it

```sh
cd ventures/sales-agent
IMAP_HOST=imap.example.com IMAP_USER=you@example.com IMAP_PASS=an-app-password \
ADMIN_TOKEN=$(openssl rand -hex 16) node self-host/agent.mjs
# open http://127.0.0.1:8787/?token=<ADMIN_TOKEN>
```

Or `docker compose up -d` from `ventures/sales-agent` with the same variables.
Use an app password where your provider offers one (Gmail and Microsoft 365
require one or OAuth for IMAP; OAuth is built, see below). The server binds to 127.0.0.1
by default; before exposing it, put a TLS proxy in front, because the token
travels in the URL and header.

| Variable | Default | |
|---|---|---|
| `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` | required | `IMAP_PORT` 993, `IMAP_SECURE=false` for a plain test server, `IMAP_BOX` INBOX, `TLS_CA_FILE` a PEM file of an extra trusted CA for a mail server with a private certificate (certificates are always verified; there is no switch to skip it) |
| `ADMIN_TOKEN` | required, 12+ chars | protects every page except `/healthz` |
| `DATA_DIR` | `./data` | `state.json` (prospects, queue, cursor), `audit.jsonl` |
| `POLL_MINUTES`, `SINCE_DAYS` | 10, 7 | first poll reads the last `SINCE_DAYS` days, then only new UIDs |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | none (send off) | `SMTP_PORT` 587 (STARTTLS; 465 with `SMTP_SECURE=true`), `SEND_FROM` (default `IMAP_USER`), `SEND_MAX_PER_DAY` 20. A password is never sent over an unencrypted link to a non-local host |
| `OAUTH_PROVIDER` (`google` or `microsoft`), `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REFRESH_TOKEN` | none (password login) | M4c: replaces `IMAP_PASS`/`SMTP_PASS` with SASL XOAUTH2 on both IMAP and SMTP. `OAUTH_TENANT` (Microsoft, default `common`), `OAUTH_TOKEN_URL` override. Your own OAuth app, your own token |
| `PIPEDRIVE_API_TOKEN` and/or `HUBSPOT_TOKEN` (`PIPEDRIVE_BASE`, `HUBSPOT_BASE` to override) | none (off) | M8a: after each poll, writes every read reply as a note on the *existing* contact (exact email match) and sets the CRM's opt-out on an unsubscribe (Pipedrive `marketing_status: unsubscribed`, HubSpot `hs_email_optout`). Never creates people or deals, moves stages, deletes or sends; each result is in the audit log as `crm_writeback`. Tested against a fake HTTP server only; no real account tried |
| `PIPEDRIVE_MEETING_STAGE_ID`, `HUBSPOT_MEETING_STAGE` | none (off) | M8b: shows a "Move their open deal to the meeting stage" button on interested replies. Only your click moves anything (`POST /api/crm-stage`, audited as `crm_stage`); it moves the contact's one open deal and skips with zero or several, once per reply. Fake server only |
| `OFFER_JSON` | none | your sender, company, address, booking link (see `SAMPLE_OFFER` in `engine.mjs`) |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | none | optional model on your key, under the same limits as the page |

Messages you sent yourself are skipped. Each message is read once (Message-ID);
duplicates are ignored. Endpoints: `/` queue, `/api/queue`, `/api/audit`,
`/api/prospects.csv`, `/api/suppression.csv`, `POST /api/poll`, `POST /api/decide`, `POST /api/send`.

## One-click deploy (2026-10-28)

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds `ventures/sales-agent/Dockerfile` in **your** account with a 1 GB disk for the queue and audit log, generates `ADMIN_TOKEN`, and asks you for `IMAP_HOST`, `IMAP_USER` and `IMAP_PASS` (an app password); `SMTP_*` and a model key are optional. Nothing runs on the author's accounts and your mailbox password goes from your Render settings to your mail server. Fly.io steps are at the top of `fly.toml`. Open `https://<your-app>/?token=<ADMIN_TOKEN>`; Render and Fly terminate TLS.

A fault this found: the Dockerfile copied only `agent.mjs` and `imap.mjs`, so the image crashed at start (`Cannot find module smtp.mjs`; also `oauth.mjs` and `research.mjs`). Fixed, and `dockerfile.test.mjs` now walks the server's imports and fails if one is not copied. **Not tested: an actual Render or Fly deploy** (no account here); the image's file set was checked by copying exactly the Dockerfile's files into an empty directory and starting the server there (healthz answered).

## OAuth for Gmail and Microsoft 365 (M4c)

Register your own OAuth app (Google Cloud console, or Microsoft Entra) with the redirect URI
`http://127.0.0.1:8789/callback`, then once:

```sh
OAUTH_PROVIDER=google OAUTH_CLIENT_ID=... OAUTH_CLIENT_SECRET=... IMAP_USER=you@gmail.com node self-host/oauth-setup.mjs
```

Open the printed URL, approve, and copy the `OAUTH_REFRESH_TOKEN=...` line it prints into the server's environment
(authorization code flow with PKCE; nothing is stored). The server then trades the refresh token for short-lived access
tokens at the provider's token endpoint, caches one until a minute before it expires, and logs in with `AUTHENTICATE XOAUTH2`
(IMAP) and `AUTH XOAUTH2` (SMTP). Mailbox access is still `EXAMINE` and `BODY.PEEK`. Set `SMTP_HOST` (`smtp.gmail.com`,
`smtp.office365.com`) to turn sending on as before. Scopes: `https://mail.google.com/` for Google; Microsoft's
`IMAP.AccessAsUser.All` and `SMTP.Send`. Google apps left in "testing" expire refresh tokens after 7 days; publish the app
(or use Workspace internal) for a lasting token. Microsoft personal accounts may need a different tenant setting.

Tested (`node --test self-host/oauth.test.mjs`, 7 tests) against a local token endpoint and the fake IMAP and SMTP servers:
Google's documented XOAUTH2 string, caching and one shared refresh for concurrent callers, a refresh 60 s before expiry, a
revoked token reported with no secret in the message, the IMAP error challenge answered before the NO, the SMTP 334 then 535
path, PKCE and the code exchange, and an end-to-end poll and send with no password set. **Not tested: Google's or
Microsoft's real endpoints, scopes or consent screens.** The first deployer on either should expect a scope or tenant
fix and send a patch.

## What was tested, and what was not

`node --test self-host/agent.test.mjs`: MIME (plain, quoted-printable, base64
HTML, multipart, encoded subjects), the IMAP client against an in-memory fake
server (`fake-imap.mjs`) that records every command, an end-to-end poll that
suppresses an unsubscribe and queues a reply, a wrong password that leaks nothing, the send guards (off by default, approved only, once, suppressed and daily-cap refusals, header and dot-stuffing handling, a refused recipient, a wrong SMTP password) against an in-memory fake SMTP server (`fake-smtp.mjs`),
placeholder blocking, and token checks. **Not tested: any real mail server, IMAP or SMTP.** The SMTP client is hand-written (EHLO, STARTTLS, AUTH PLAIN/LOGIN, DATA); STARTTLS and implicit TLS are not exercised by the fake. No DKIM/SPF/DMARC work here: your provider signs on submission, and a new sending domain needs those set up first.
Gmail, Fastmail, Outlook and Dovecot differ in literal and flag handling; the
first deployer on one should expect to fix a parser edge and send a patch. Not
built: IMAP IDLE, attachments, threading beyond Message-ID, a bounce-to-
prospect match (DSNs arrive as tasks, as on the page).

## Header signals (2026-10-26)

The poller reads standard headers before words: an RFC 3464 delivery status
with `Status: 5.x.x` is a bounce of the address in `Final-Recipient` (not of
`mailer-daemon`), `4.x.x` or `Action: delayed` pauses instead of bouncing, and
`Auto-Submitted: auto-replied` or `X-Autoreply` is an auto-reply. Tested on
hand-built messages in `agent.test.mjs`, not on a real mail server's output.
