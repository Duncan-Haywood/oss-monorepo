# Self-hosted Sales Agent (M4a, M4b)

A small server you run yourself. It reads **your** mailbox over IMAP, reads each
new reply the way the inbox agent does ([`../README.md`](../README.md)), stops,
pauses and suppresses on its own, and shows the drafts in an approval queue. You
approve, edit or reject; every decision goes into an append-only audit log. Your
mailbox password goes from your environment to your mail server and nowhere else:
no hosted service of ours is involved.

**By default it sends nothing.** The mailbox is opened with `EXAMINE` and read
with `BODY.PEEK`, so nothing is marked read, moved or deleted (tested; `imap.mjs`
has no write verbs). Approving a draft marks it approved in the log and gives you
a `mailto:` link.

**Sending is opt-in (M4b).** Set `SEND_ENABLED=true` and `SMTP_HOST` and each
approved draft gets a **Send now** button. One click sends one message from your
own SMTP account (`smtp.mjs`, no dependencies) with a `List-Unsubscribe: <mailto:…>`
header, `In-Reply-To`/`References` threading, and a footer line that says how to
stop plus your postal address from `OFFER_JSON`. It refuses a recipient on the
suppression list, a draft already sent, an unapproved draft, and more than
`SEND_MAX_PER_DAY` (20) in a UTC day; every send and refusal is in the audit log.
Nothing sends without the click. Automatic sending is M5 and waits on the owner
([`../ROADMAP.md`](../ROADMAP.md)). You are the sender: CAN-SPAM, GDPR and your
provider's terms are yours to meet; this is not legal advice.

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
| `SEND_ENABLED`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` | off | `SMTP_PORT` 465 (587 with `SMTP_SECURE=false SMTP_STARTTLS=true`), `SMTP_FROM` (default `IMAP_USER`), `SEND_MAX_PER_DAY` 20. Credentials are refused over a clear-text link unless `SMTP_ALLOW_CLEAR=true` (test servers only) |
| `OFFER_JSON` | none | your sender, company, address, booking link (see `SAMPLE_OFFER` in `engine.mjs`) |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | none | optional model on your key, under the same limits as the page |

Messages you sent yourself are skipped. Each message is read once (Message-ID);
duplicates are ignored. Endpoints: `/` queue, `/api/queue`, `/api/audit`,
`/api/prospects.csv`, `/api/suppression.csv`, `POST /api/poll`, `POST /api/decide`, `POST /api/send`.

## What was tested, and what was not

`node --test self-host/agent.test.mjs`: MIME (plain, quoted-printable, base64
HTML, multipart, encoded subjects), the IMAP client against an in-memory fake
server (`fake-imap.mjs`) that records every command, an end-to-end poll that
suppresses an unsubscribe and queues a reply, a wrong password that leaks nothing,
placeholder blocking, and token checks; and the send path against an in-memory
fake SMTP server (`fake-smtp.mjs`, plain TCP): headers, dot-stuffing, threading,
AUTH PLAIN, a wrong password that leaks nothing, a rejected recipient, the
suppression, repeat and daily-cap refusals, header-injection stripping, and the
clear-text-credentials refusal. **Not tested: any real mail server, and the
STARTTLS and implicit-TLS paths** (the fake has no certificate). The message is
plain text only; deliverability (SPF, DKIM, DMARC) is your domain's job.
Gmail, Fastmail, Outlook and Dovecot differ in literal and flag handling; the
first deployer on one should expect to fix a parser edge and send a patch. Not
built: OAuth (so Gmail and Microsoft 365 need an app password for SMTP too), IMAP IDLE, attachments, threading beyond Message-ID, a bounce-to-
prospect match (DSNs arrive as tasks, as on the page).
