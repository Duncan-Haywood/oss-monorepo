# Self-hosted Sales Agent (M4a, M4b)

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
require one or OAuth for IMAP; OAuth is not built). The server binds to 127.0.0.1
by default; before exposing it, put a TLS proxy in front, because the token
travels in the URL and header.

| Variable | Default | |
|---|---|---|
| `IMAP_HOST`, `IMAP_USER`, `IMAP_PASS` | required | `IMAP_PORT` 993, `IMAP_SECURE=false` for a plain test server, `IMAP_BOX` INBOX |
| `ADMIN_TOKEN` | required, 12+ chars | protects every page except `/healthz` |
| `DATA_DIR` | `./data` | `state.json` (prospects, queue, cursor), `audit.jsonl` |
| `POLL_MINUTES`, `SINCE_DAYS` | 10, 7 | first poll reads the last `SINCE_DAYS` days, then only new UIDs |
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | none (send off) | `SMTP_PORT` 587 (STARTTLS; 465 with `SMTP_SECURE=true`), `SEND_FROM` (default `IMAP_USER`), `SEND_MAX_PER_DAY` 20. A password is never sent over an unencrypted link to a non-local host |
| `OFFER_JSON` | none | your sender, company, address, booking link (see `SAMPLE_OFFER` in `engine.mjs`) |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | none | optional model on your key, under the same limits as the page |

Messages you sent yourself are skipped. Each message is read once (Message-ID);
duplicates are ignored. Endpoints: `/` queue, `/api/queue`, `/api/audit`,
`/api/prospects.csv`, `/api/suppression.csv`, `POST /api/poll`, `POST /api/decide`, `POST /api/send`.

## What was tested, and what was not

`node --test self-host/agent.test.mjs`: MIME (plain, quoted-printable, base64
HTML, multipart, encoded subjects), the IMAP client against an in-memory fake
server (`fake-imap.mjs`) that records every command, an end-to-end poll that
suppresses an unsubscribe and queues a reply, a wrong password that leaks nothing, the send guards (off by default, approved only, once, suppressed and daily-cap refusals, header and dot-stuffing handling, a refused recipient, a wrong SMTP password) against an in-memory fake SMTP server (`fake-smtp.mjs`),
placeholder blocking, and token checks. **Not tested: any real mail server, IMAP or SMTP.** The SMTP client is hand-written (EHLO, STARTTLS, AUTH PLAIN/LOGIN, DATA); STARTTLS and implicit TLS are not exercised by the fake. No DKIM/SPF/DMARC work here: your provider signs on submission, and a new sending domain needs those set up first.
Gmail, Fastmail, Outlook and Dovecot differ in literal and flag handling; the
first deployer on one should expect to fix a parser edge and send a patch. Not
built: OAuth (Gmail and Microsoft need an app password for SMTP too), IMAP IDLE, attachments, threading beyond Message-ID, a bounce-to-
prospect match (DSNs arrive as tasks, as on the page).

## Header signals (2026-10-26)

The poller reads standard headers before words: an RFC 3464 delivery status
with `Status: 5.x.x` is a bounce of the address in `Final-Recipient` (not of
`mailer-daemon`), `4.x.x` or `Action: delayed` pauses instead of bouncing, and
`Auto-Submitted: auto-replied` or `X-Autoreply` is an auto-reply. Tested on
hand-built messages in `agent.test.mjs`, not on a real mail server's output.
