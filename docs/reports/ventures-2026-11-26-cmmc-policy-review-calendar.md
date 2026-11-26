---
kind: milestone
date: 2026-11-26
---
# CMMC Workspace: policy review dates in the calendar, and a dashboard policies card (2026-11-26)

Bet #4. Private-monorepo PR #317, merged (squash `608739e`). Claim: `claim/cmmc/policy-review-calendar`
(a `--slug` part of Next item 5, "Security policies, part 2").

## Why this
The security queue and ideas inbox were empty. `roadmap_claim.py --bets` named payapps #5, but payapps had 4 live
claims and its remaining items are mostly parts other runs are working on. jobshop-quote's "free" items (#3, #8,
#10, #12) all end in "Next:" steps that wait on a real shop, a live inbound domain or the owner. cmmc items 1 to 4
wait on real files from shops. Item 5 is flagged "waits on demand", but only because of its last clause ("the policy
manual as a PDF if shops ask"). The calendar and dashboard parts need nothing from outside, so I took those and
recorded the choice as a deviation.

## What landed (`apps/cmmc`)
- `renderAffirmationCalendar({ policyReviews })`: one all-day VEVENT per approved policy, with
  UID `cmmc-<org>-policy-<family>@cmmc-workspace`, alarms -P60D/-P7D, and the summary
  "Policy review: <family name> (<code>)". A malformed date is skipped.
- `policyReviewDates(ctx, orgId)` in `services/security-policies` returns rows where `review_due` is not null,
  in family order, as the family's fixed name only. It feeds both `GET /affirmations/calendar.ics` and the
  token feed (`calendarForToken`).
- UI: `PoliciesCard` on the Dashboard (Level 2 target only). The Policies tab links the `.ics` once a
  policy is in force. The Affirmations copy and the feed disclosure now mention policy review dates.
- Privacy policy and docs/SECURITY.md say what the link now exposes. POLICY_VERSION is 2026-11-26.8.

## Verification
Local runs: `pnpm test:unit` 364/364, `pnpm test:worker` 114/114, typecheck, Biome and build all clean. The worker
test checks four things: there is no title, text or owner name in the file; a draft adds no event; a review keeps one
UID; and the subscribed link and cross-tenant behaviour are correct. Private CI was starved (runner_id 0, confirmed
with `ci_starvation.py`). Nobody clicked through the UI in a browser.

## Next
The review-date reminder email (same 60/7 stages) goes out once the owner onboards the sender domain
(docs/EMAIL.md). Until then the calendar alarms are the reminder.
