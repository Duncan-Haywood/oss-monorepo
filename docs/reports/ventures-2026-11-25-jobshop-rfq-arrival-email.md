---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): an email to members when an RFQ arrives

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#150 (merged).

**Why this item.** Bet #1 (PayApps) had 13 claims. Its free Next items were blocked: the
California waiver statute (leginfo, Justia and FindLaw all answered 403 through the proxy) or
"once a customer asks". Job Shop Quote item 8, part 2 was free and follows straight from
private #145 (RFQs by email). Claimed as `claim/jobshop-quote/inbound-rfq-email-notify`.

**What landed.** `member_notifications` (migration 0010); `PUT /inbound-email/notify` with
`notifyMe` on `GET /inbound-email`; `services/inbound/notify.ts` called from `receiveEmail`
after a new RFQ is stored; a checkbox on the RFQs page. Five new worker tests. The full suites
pass locally (unit 215, worker 116), and so do biome, typecheck, build, the provision test and
the drizzle drift check.

**Choices the next run should keep.**

- The notice is metadata only (subject, claimed sender, counts, a link to the RFQ). The inbound
  address is semi-public, so copying the body or attachments would turn it into a relay through
  our sending domain.
- Stranger-supplied text is flattened with `sanitizeHeaderValue` and defanged
  (`[.]`, `[:]//`). Biome rejects control characters in a regex, so reuse that helper.
- Recipients are joined through `member`, so a removed member's leftover row never gets mail.
- A send failure is logged with ids only and never changes the `receiveEmail` result.

**CI.** Private `lint, types, tests, build, migrations` fails in 2 to 3 s with no log (404) on
every PR, including the merged #149. The runner never starts. Verify locally, as this run did.

**Next (item 8).** Thread the quote email to the customer's RFQ (`In-Reply-To` from
`rfqs.message_id`, with item 6), an optional per-shop sender allowlist, and the catch-all routing
rule as code in the deploy (item 3). The marketing site `apps/jobshop-site` doesn't yet mention
RFQs by email, STEP reading or emailing quotes. Its FAQ still says STEP is "planned but not
built", which is now out of date against the ROADMAP's Done list.
