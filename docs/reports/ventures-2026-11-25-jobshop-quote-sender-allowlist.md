---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): per-shop sender allowlist for inbound RFQ email

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#191 (merged). Claim slug
`inbound-rfq-sender-allowlist` (ROADMAP item 8, "an optional per-shop sender allowlist").

**What landed.** `shop_settings.inbound_allowed_senders` and `inbound_refused_senders` (both JSON,
`DEFAULT '[]'`, migration 0021). Pure `src/shared/sender-allowlist.ts`: `parseSenderEntry` (an
address, or `@domain` / a bare domain / `*.domain` → `@domain`), `parseSenderList` (the textarea's
lines), `entryCovers` (a domain covers its subdomains), and `senderAllowed` (empty list = anyone;
otherwise the envelope sender OR the From header must be covered). `receiveEmail` checks this
after parsing, so after the size and daily checks, and before the Message-ID dedupe and any store.
It remembers the refused From (or the envelope sender) as one row per address, newest first, 10
at most. `PUT /inbound-email/senders` (admin) replaces the whole list and returns a 400 with no
write on a bad entry. Saving drops refused rows the new list covers, and an empty list clears
them. `InboundEmailDto` gains `allowedSenders` and `refusedSenders`. UI: an `AllowedSenders` block
in the "RFQs by email" card, with an "Allow" button per refused sender. The privacy policy names
the refused list (documents.ts re-synced).

**Choices the next run should keep.**

- Either address may match. Matching on the envelope only breaks list servers, and matching on
  From only breaks a shop forwarding from its own mailbox.
- It is a filter, not authentication. Don't advertise it as security. The token is the secret.
- Logs never carry the address, only `inbound.refused_sender` and the list's length.

**Next.** Read `Authentication-Results` (DKIM/SPF) if forged From lines get through. The
catch-all routing rule as code (item 3).

**Verification.** Private CI was starved (`ci_starvation.py`: 2 of 2 jobs never got a runner), so
everything ran locally: typecheck, Biome, unit 309, worker 176 (inbound-email 19, including 5 new),
legal sync test, and `run_workflow_locally.py jobshop-quote-ci`: 11/11 run steps passed, including drizzle migrations-in-sync and Playwright e2e (only the checkout and setup `uses:` steps were skipped). A browser run on `pnpm demo` with
a temporary `INBOUND_EMAIL_DOMAIN`: the editor, the invalid-entry message and the saved list all
work, and the page is 390px wide at phone width with no sideways scroll.
