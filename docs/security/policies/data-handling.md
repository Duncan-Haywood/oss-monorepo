# Data handling, retention and privacy

Status: draft, 2026-11-03. SOC 2: C1.1, C1.2, P1–P8, CC6.5. The legal
floor is [`docs/legal/privacy-baseline.md`](../../legal/privacy-baseline.md);
this file is the inventory and the procedure that sit on it.

## Classification

| Class | Meaning | Where it may live | Examples |
|---|---|---|---|
| Public | Meant to be published | The repository, the site, packages | Code, posts, aggregate counts, feedback text the sender was told is public |
| Private | Personal data or a stranger's words not meant for publication | Cloudflare D1 only, behind a token | Inbox messages and sender addresses |
| Secret | Credentials | GitHub and Cloudflare secret stores only | Tokens, API keys, `INBOX_TOKEN` |

Private and secret data never enter the repository, a commit message, a PR,
a CI log or a post.

## Record of processing

GDPR art. 30 exempts organisations under 250 people unless processing is
regular; the inbox is regular, so this table is the record.

| Activity | Data | Purpose | Lawful basis | Where | Recipients | Kept |
|---|---|---|---|---|---|---|
| Page-load counts (`platform/counter/`, `platform/edge/`) | Day, page, channel tag, referrer class, country code, device class; aggregates only. The request's IP is seen by the host and not stored | Know which tools are used | Not personal data once aggregated (recital 26); legitimate interests for the transient request | Cloudflare D1, then aggregates in the repository | Public | Indefinitely (aggregates) |
| Feedback form (`POST /feedback`) | Message text (emails stripped), tool, page, day; sender IP used only in memory for the rate limit | Improve the tools | Legitimate interests; the form says the text is published | D1, then the repository | Public | Indefinitely (published by design) |
| Inbox (`support@`, `hello@`, `accounts@marisstella.app`) | Raw message: sender address, recipients, subject, body | Answer the sender; receive platform account notices | Legitimate interests (art. 6(1)(f)) in answering mail people choose to send | Cloudflare D1 | Agents holding `INBOX_TOKEN`; Cloudflare as processor | **90 days**, then deleted by code (`platform/edge/inbox.mjs`) |
| Tool inputs | Whatever a visitor types | Run the tool | Not received: tools run in the browser | The visitor's browser | Nobody | The visitor's choice (local storage) |
| GitHub issues and PRs | Whatever people post, with their GitHub identity | Bug reports, contributions | Legitimate interests; GitHub's own terms | GitHub | Public | GitHub's terms |

Products that call a live public API (the footer's "Except ..." clause in
`platform/pages/build.mjs`) send what the user pastes to that API and are
named on the page.

## Transfers

Cloudflare and GitHub are US companies. Both certify under the EU-US Data
Privacy Framework and offer standard contractual clauses in their DPAs
(`docs/security/soc2/vendors.md`); that is the chapter V mechanism.

## Requests from people (access, correction, deletion, objection)

1. A request arrives by email to the inbox or through any other channel.
   Answer within **one month** (GDPR art. 12(3)); California and other US
   state laws allow 45 days, so one month meets both.
2. Confirm the requester controls the address (reply to it).
3. **Access:** send them the stored messages from their address
   (`node platform/edge/read-inbox.mjs --json`, then keep the rows whose `mail_from` is theirs).
4. **Deletion:** `DELETE /inbox?id=<n>` for each of their messages
   (`platform/edge/README.md`, "Retention"). Published feedback text has no
   sender attached; if they identify it, remove it from
   `portfolio/usage/site-feedback.json` in a PR.
5. Log the request below with the date and outcome only, no name or address.

| Received | Type | Answered | Outcome |
|---|---|---|---|
| | | | |

## Children

The products are general-audience and do not knowingly collect data from
children (COPPA; GDPR art. 8).

## Disposal

Inbox rows past 90 days are deleted on every delivery and read. A Worker or
D1 database that is retired is deleted with `wrangler delete` /
`wrangler d1 delete`, and the deletion recorded in `docs/history/`.
