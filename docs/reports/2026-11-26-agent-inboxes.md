# Agent-managed inboxes (2026-11-26)

For the next session that touches mail. The owner asked for "agent managed
inboxes for the domains" before the paid apps launch.

## What exists now

- `platform/email/inboxes.yaml` is the source of truth for every address
  on marisstella.app: hello, support, privacy, security, billing, accounts,
  sales, dmarc, and the product addresses grants, payapps, seller-books.
  `gen_config.py` writes the Worker's `inboxes.json` and the routing file
  `platform/pages/cloudflare/email-routing.json`, which the Cloudflare
  apply step and the AWS email-ops SES rule both read. CI fails on drift.
- The `marisstella-mail` Worker stores raw MIME in R2 (or in D1 when the
  account has no R2) and a parsed, threaded copy in D1; flags legal, refund,
  chargeback, security, human-request and data-request mail to the owner
  (immediate email, capped at 20 a day, plus a daily digest); forwards
  privacy@ and security@ to the owner's address; purges by per-inbox
  retention.
- Agents use `node platform/email/cli.mjs` (or `cli.mjs mcp`). Sends pass
  `guardrails.mjs`: replies only to thread participants, no sends on a
  flagged thread (only the owner token resolves a flag), drafts only for
  privacy@/security@/accounts@/dmarc@, never to machines, daily and
  per-recipient caps, marketing only to recorded opt-ins with the CAN-SPAM
  footer and one-click unsubscribe, cold outreach refused (it belongs on the
  email-ops cold stream's own domain). Every attempt is logged.
- The Privacy Policy now states the per-inbox retention (up to 7 years for
  billing mail) and that an AI assistant (Anthropic) reads and drafts.

## What is not done

- **Not deployed.** It needs the owner's secrets and token permissions:
  `portfolio/ledger/asks.yaml`, `agent-inboxes-secrets`.
- **Replies to customers** need the domain onboarded to Cloudflare Email
  Service; until then sends fail at the provider and are logged `failed`.
  Owner alerts work without it (verified destination).
- **AWS store**: a DynamoDB + S3 implementation of `store.mjs`'s port that
  passes `storeContract`. The SES inbound adapter and SES sender adapter exist.
- **A second domain** needs a second routing file and apply run.
- The old edge Worker's `/inbox` keeps whatever it already holds until its
  90-day purge; nothing new reaches it after the routing apply.

## Owner preference to keep in mind

2026-11-03: "agent managed inbox not mine", "no forwarding". The 2026-11-26
brief asked for per-address forwarding as a config switch, so forwarding is
on only for privacy@ and security@ (statutory deadlines and vulnerability
reports), off everywhere else. Turn either off in `inboxes.yaml` if the
owner prefers.
