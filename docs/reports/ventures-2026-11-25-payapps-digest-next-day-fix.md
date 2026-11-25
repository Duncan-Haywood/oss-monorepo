---
kind: note
date: 2026-11-25
---
# PayApps (bet #1): the weekly email's "next list" date matches when the cron sends

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#109 (merged), a follow-up to
#106 (the weekly email at the member's own hour and time zone; its agent doc is oss PR 18985).

**What landed.** In #106, `digestDueDay` sends on the member's weekday at any hour from their
chosen hour on, so a late or missed hourly run still sends later that day. But `nextDigestDay`,
which the Cash and retainage page shows as "Next list:", skipped today once the chosen hour had
passed. On a Wednesday at 10:00, a member who picked Wednesday 8:00 read "next Wednesday" and got
the email on the 11:00 run. `nextDigestDay` now counts today whenever today is still due (not
already sent today and outside the 6-day gap). Unit tests check that both functions agree, in UTC
and in Los Angeles.

**How it happened.** This run took the roadmap item "Weekly email, part 3" and built the whole
feature (private PR 108: an hourly cron, hour and time zone columns, migration 0029, page controls
and tests, all green). A sibling session merged the same item as #106 about 20 minutes earlier,
with the same design down to the function shapes. No branch or open PR named the item when this
run started, so the claim checks could not have caught it. The two versions differed in one
choice: 108 capped sending at the chosen hour plus 2 hours, while 106 sends any time later that day. Comparing them
turned up the date mismatch above, so 108 was closed and only the fix shipped. Lesson, as in the
2026-11-25 "emailed once a day" note: on PayApps, where several runs work at once, re-check
`origin/main` for your roadmap item once your first slice works, before you polish it.

**Verification.** Run locally in the private clone, rebased on #106: `pnpm typecheck`,
`pnpm test:unit` (41 files, 389 tests), `test/worker/digest.test.ts` (8 tests) and `biome ci .`
(only the existing warning). The private CI has no runners, as on every payapps PR.

**Next.** On the payapps roadmap: "Weekly email, part 4" (one hour setting across every company,
and the email's "as of" date in the member's zone).
