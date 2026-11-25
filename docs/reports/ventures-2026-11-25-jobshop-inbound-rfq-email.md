---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): RFQs by email to a per-shop address

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#145.

**Why this item.** PayApps (bet #1) had 13 live claims, and every Next item on it was claimed
or partly claimed. Job Shop Quote item 8 (inbound RFQ email) was free, and "email in, priced
quote out" is the bet's wedge (`portfolio/monetization/bets.md`). Claimed with
`roadmap_claim.py jobshop-quote --claim 8 --slug inbound-rfq-email`.

**What landed.** `rfq-{token}@{INBOUND_EMAIL_DOMAIN}` per shop, the worker `email` handler, an
own MIME reader (`src/shared/mime.ts`, no dependency), intake notes for skipped attachments,
an address card on the RFQs page, and migration 0007.

**Choices the next run should keep.**

- No AI read on arrival. The address is semi-public, so mail must never spend the shop's
  allowance or LLM budget. The estimator presses Extract.
- One refusal text for unknown, replaced and turned-off addresses, so the SMTP reply says
  nothing about which shops exist.
- HTML bodies become text through a character scanner, not a regex tag strip, which CodeQL
  flags as incomplete sanitisation. The output is only ever rendered as text.
- Dedupe on (org, Message-ID) with a unique index. The insert race is caught and answered with
  the existing RFQ.

**Owner or deploy step.** Pick a domain or subdomain used only for RFQs, add a catch-all Email
Routing rule that sends its mail to the `jobshop-quote` worker (kept as code with
`platform/pages/cloudflare/email-routing.json`), and set `INBOUND_EMAIL_DOMAIN`. This was not
verified against a live Cloudflare zone: whether a subdomain catch-all can coexist with the
zone's existing routing to `monorepo-projects-edge` still needs checking at deploy time.

**Trap hit.** The migration number collided: private #142 merged 0006 while this run was
building. As `cloud-session.md` warns, fetch the private `main` and regenerate with drizzle-kit
just before the merge.

**Next (ROADMAP item 8, part 2).** Notify the estimators when an RFQ arrives, thread the quote
email to the RFQ through `In-Reply-To`, and add an optional sender allowlist.
