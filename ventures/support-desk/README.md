# Support Desk

After using this, you can now **answer customer email from a shared inbox you host yourself**, with status, notes, reply targets and saved replies, instead of paying a help desk per agent per month or sharing a Gmail login.

Two parts, both free and MIT:

- **`index.html`**: paste a customer email and see its priority guess, the reasons, your first-reply target and which saved replies match. Runs in the browser; nothing is uploaded.
- **`server.mjs`**: one Node process, **zero dependencies**, state in one JSON file. Email webhook, contact-form endpoint, admin inbox, customer portal, CSV export.

## Why someone would use this

| Today | Cost / catch | Support Desk |
|---|---|---|
| Help Scout, Front, Zendesk, Freshdesk, Crisp | Priced per agent per month; conversations live with them | Your server, unlimited mailboxes and tickets, no seat fee |
| A shared Gmail inbox or alias | No owner, no status, replies collide, nothing shows what is overdue | Status, assignee, notes, reply targets, overdue list |
| Chatwoot, FreeScout, Zammad | Full products: database, queue, operations | One Node process and one JSON file |

Honest limits: no live chat, no attachments (file parts are dropped), no mobile app, no user accounts or roles (each agent can have a personal key, below, but every key has full admin rights), reply drafts are optional and need your own AI key (without one you get keyword-matched saved replies). For more than a few agents or high volume use a full help desk.

## How it works

1. **Create a mailbox** at `/admin` (any user name, `ADMIN_KEY` as the password). You get two URLs:
   - `POST /in/<token>`: the inbound email webhook. Point Postmark inbound, Mailgun routes, Resend inbound or any email-to-webhook forwarder at it, and forward your support address there. Postmark JSON, Mailgun (urlencoded or multipart) and plain JSON (`from`, `subject`, `text`, optional `messageId`, `inReplyTo`) are understood. The token is the credential; mail is limited to 120 a minute per mailbox.
   - `POST /m/<mailbox>`: a contact form for your site (`name`, `email`, `subject`, `message`; `_gotcha` is a honeypot). Allowed sites and a 10-a-minute limit per address apply.
2. **Tickets thread** by the `[#n]` reference in the subject, or by `In-Reply-To`, and **only when the sender is the original requester**, so quoting a ticket number never lets a stranger write into it. Quoted history is stripped. A customer reply reopens a pending or closed ticket. Bounces, out-of-office and `no-reply` mail are dropped so two robots cannot loop. Duplicate deliveries are ignored.
3. **Each new ticket is triaged**: words like refund, charged twice, outage or locked out raise priority, feature requests lower it, obvious spam goes to the Spam tab. The reasons are shown on the ticket. The first-reply target is the mailbox's hours, a quarter for high priority and double for low; the list puts overdue tickets first and the dashboard shows the median first reply, the share answered in target and the share of rated tickets the customer called solved.
4. **Reply from the ticket page.** Saved replies (`/admin/macros`, with `{{name}}`, `{{ticket}}`, `{{company}}`) are ranked against the customer's message by TF-IDF cosine similarity and fill the reply box when picked. Internal notes are never emailed. The ticket page lists that customer's earlier tickets, and each mailbox on `/admin` has a copy-paste HTML contact form for your site. The customer gets a secret link (`/t/<token>`) to follow the ticket, reply and, once staff have answered, say whether it was solved (one vote and an optional comment per ticket, also in the CSV).
5. **Housekeeping**: an optional acknowledgement text emailed once a day per address on new tickets (only the text you wrote plus the ticket reference, never anything the sender typed); `AUTO_CLOSE_DAYS` closes tickets waiting on the customer; `RETENTION_DAYS` deletes closed and spam tickets; CSV export is spreadsheet-formula safe.

## AI reply drafts (your own key, optional)

On a ticket, **Draft a reply** fills the reply box with a draft built from your saved replies and the conversation; you edit and press Send. It never sends or saves anything itself. Set one of `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (+ `LLM_MODEL`), `GEMINI_API_KEY` (+ `LLM_MODEL`), or `LLM_PROVIDER=openai-compatible` with `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` (OpenRouter, Groq, local Ollama). The key stays in your server's environment and calls go from your server to your provider. With no key, or if the call fails, the button gives the best-matching saved reply and says AI is off. The model is told to answer only from your saved replies, to promise no refunds, dates or features they do not state, and to treat the customer's text as data, not instructions. Customer messages are sent to the provider you chose, so cover that in your privacy notice.

## Run it

```sh
cd ventures/support-desk
node --test        # no network
ADMIN_KEY=$(openssl rand -hex 16) COMPANY_NAME=Acme node server.mjs
```

Email starts in **dry run**: replies are stored on the ticket but nothing is sent. To send, set `DRY_RUN=false`, `RESEND_API_KEY` and `MAIL_FROM` (an address on a domain you verified with Resend, your own account). Optional: `ALERT_WEBHOOK_URL` (Slack/Discord, https) pings on each new ticket; `STATE` (JSON file path; keep it on a persistent disk), `PORT`, `PUBLIC_URL` (used in links), `AGENT_KEYS` (`alice:key-of-12-chars-or-more,bob:...`: each agent signs in at `/admin` with their name and personal key, replies and notes are signed with it, and a reply claims an unassigned ticket; `ADMIN_KEY` keeps working and signs as "agent"), `TRUST_PROXY=true` behind a proxy, `HIDE_SPONSOR_LINK=true`, `AUTO_CLOSE_DAYS`, `RETENTION_DAYS`.

## One-click deploy

Fork the repository, then open `https://render.com/deploy?repo=<your fork URL>`. Render builds the Dockerfile in **your** account with a 1 GB disk and generates `ADMIN_KEY`. Nothing runs on the author's accounts. Serve it over HTTPS only (Render does); the admin uses HTTP Basic auth. `docker-compose.yml` runs it on any box with Docker; Fly.io steps are at the top of `fly.toml`.

## Disclaimer

No warranty; no uptime or delivery guarantee. You operate the desk and are responsible for the messages collected, your privacy notice, data-protection rules and your own email sending. Priority, spam and reply suggestions are heuristics and can be wrong; read before you send. Not legal, tax or financial advice. MIT licensed. If it saves you a subscription, you can [sponsor the author](https://github.com/sponsors/Duncan-Haywood).
