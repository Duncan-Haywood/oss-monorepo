# Self-hosted Sales Agent (M4a)

A small server you run yourself. It reads **your** mailbox over IMAP, reads each
new reply the way the inbox agent does ([`../README.md`](../README.md)), stops,
pauses and suppresses on its own, and shows the drafts in an approval queue. You
approve, edit or reject; every decision goes into an append-only audit log. Your
mailbox password goes from your environment to your mail server and nowhere else:
no hosted service of ours is involved.

**It sends nothing.** No SMTP, no send path (a test fails if one appears). The
mailbox is opened with `EXAMINE` and read with `BODY.PEEK`, so nothing is marked
read, moved or deleted (also tested). Approving a draft marks it approved in the
log and gives you a `mailto:` link; you send it from your own mail app. Sending
with a `List-Unsubscribe` header is M4b; anything automatic is M5 and waits on the
owner ([`../ROADMAP.md`](../ROADMAP.md)).

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
| `OFFER_JSON` | none | your sender, company, address, booking link (see `SAMPLE_OFFER` in `engine.mjs`) |
| `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` | none | optional model on your key, under the same limits as the page |

Messages you sent yourself are skipped. Each message is read once (Message-ID);
duplicates are ignored. Endpoints: `/` queue, `/api/queue`, `/api/audit`,
`/api/prospects.csv`, `/api/suppression.csv`, `POST /api/poll`, `POST /api/decide`.

## What was tested, and what was not

`node --test self-host/agent.test.mjs`: MIME (plain, quoted-printable, base64
HTML, multipart, encoded subjects), the IMAP client against an in-memory fake
server (`fake-imap.mjs`) that records every command, an end-to-end poll that
suppresses an unsubscribe and queues a reply, a wrong password that leaks nothing,
placeholder blocking, and token checks. **Not tested: any real mail server.**
Gmail, Fastmail, Outlook and Dovecot differ in literal and flag handling; the
first deployer on one should expect to fix a parser edge and send a patch. Not
built: OAuth, IMAP IDLE, attachments, threading beyond Message-ID, a bounce-to-
prospect match (DSNs arrive as tasks, as on the page).
