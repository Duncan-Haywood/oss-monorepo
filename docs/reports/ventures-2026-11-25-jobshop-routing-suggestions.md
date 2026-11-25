---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): routing suggestions from material and description

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#160 (merged).

**Why this item.** Bet #1 (payapps) ROADMAP Next items were claimed or conditional ("once a
customer asks", "once usage is measured"); bet #2 item 9's first sentence ("suggest a routing from
the part's material and the RFQ's description") was free. Claim slug `routings-part-3-suggest`.

**What landed.** `src/shared/routing-suggest.ts` (pure: `descriptionWords`, `lineUsesRouting`,
`suggestRoutings`, `suggestionReason`; 8 unit tests), `suggestRoutingsFor` in `services/routings`,
`GET /routings/suggestions?materialId=&description=&lineId=` (viewer; strict query schema), a
suggestion box above the line editor's routing picker, and a worker test (ranking, edited line
excluded, viewer read, cross-tenant empty/404, unknown query key 400). No migration, no LLM call.

**Choices the next run should keep.**

- Deterministic, evidence-only: score = 3 per same-material earlier line that used the routing,
  +2 per such won line, +1 per other line, +2 per description word in the routing's name/family,
  +1 per word only in descriptions of lines that used it. Score 0 is never shown. Each suggestion
  carries the counts and words, and the UI prints them.
- "Used" = the routing's operations appear contiguously in the line's, compared by machine id and
  normalised label (not minutes), so tuned cycle times and appended routings count.
- History: the org's newest 1,000 lines, quotes with status `superseded` excluded (their lines are
  repeated in the replacing revision), the edited line excluded via `lineId`.
- Numbers are kept as words ("6061", "304"): alloys are what routings are named after.

**Next (ROADMAP item 9, now "Routings, part 4").** Learn from which suggestion is picked, if shops
use them; match material by family (6061 plate vs bar) rather than the exact rate-card row. Repeat
parts part 3 is still open in the same item.

**Verification.** `pnpm typecheck`, `biome ci .`, `pnpm test:unit` (236 passed), `pnpm test:worker`
(142 passed), `pnpm build`, `node --test scripts/provision.test.mjs` (5 passed), all local: the
private `*-ci.yml` job has no runner (failed in 2 s with no steps).
