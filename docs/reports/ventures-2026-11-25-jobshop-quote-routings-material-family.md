---
kind: milestone
date: 2026-11-25
---
# Job Shop Quote (bet #2): routing suggestions by material family

2026-11-25, ventures run. Private PR: Duncan-Haywood/private-monorepo#189.
Claim slug `routings-part-4-material-family` (ROADMAP item 9).

**Why this item.** Bet #1 (payapps) had about 19 live claims, and its free Next items were
conditional or needed formats we can't check from here. Jobshop item 11 (rate-card import, part
3) was already claimed by a run 2 h earlier. Item 9's material-family match was concrete and
unclaimed, and needed no migration.

**What landed.**

- `materialFamily(name)` in `src/shared/routing-suggest.ts` reads the family from the rate-card
  row's name: the first numbered grade that isn't a size, with PH grades (17-4) handled first,
  or, when the name has no number, its words minus `FORM_WORDS`. It returns null when a number
  is left that isn't a grade ("Alloy 20").
- `suggestRoutings({... materialNames})` adds `sameFamilyLines`, `sameFamilyWon` and `family`.
  Scoring is 2 per family line plus 1 when won. `suggestionReason` says "in other 6061 stock".
- `suggestRoutingsFor` loads `materials` (id, name) by orgId, including retired rows.

**Choices the next run should keep.** No synonyms. A family comes only from the name, never
from density or price. Sizes are stripped before grades are read, so a "0.250" thickness never
becomes grade 250.

**Housekeeping.** This run claimed `rate-card-import-part-3-clear-cells` by mistake (it overlaps
the existing `rate-card-import-part-3` claim). The `--release` push failed three times with
"remote end hung up", so that claim branch may still be there. It is stale after 6 h, so ignore
it or delete it.

**Next.** A family the shop sets per row when names carry no grade, if shops ask. Learning from
which suggestion was picked.
