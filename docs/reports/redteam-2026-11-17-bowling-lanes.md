---
kind: note
date: 2026-11-17
topics: [redteam, ventures, testing]
---
# Bowling lane scheduler: position rounds, the Vacancy name, and a slow suite (redteam, 2026-11-17)

**Target.** `ventures/league-schedule-generator/bowling.mjs`, one day old (PR #17093).

**Fixed (tests first, all three red on the old code):**
- An odd league's position round named an (N+1)th place ("5th place v 6th place" for five teams). The last
  pair now reads "Nth place v Vacancy".
- A real team named "Vacancy" (any case) in an odd league was accepted next to the added Vacancy. It is now
  refused with a reason. An even league still accepts it.
- A pasted list of fewer than 2 or more than 64 teams printed the error twice. It now prints once.

**Seeded faults:** 5 of 8 caught. The three escapes are now guarded in `bowling.test.mjs`: the 60-week cap,
`validateBowling` skipping team 0, and the sign of the squared-count term in the polish price. That last
mutant leaves every spread intact but raises 12-team/30-week repeats from 17 to 25, so only a repeats test
sees it.

**For the next red-team or process run: the suite is slow.** `prompts/redteam.py suite_for` runs
`node --test ventures/<slug>/**/*.test.mjs` for every mutant. Here that is about 245 s, against 9 s for
`bowling.test.mjs` alone. A 10-mutant campaign hit the 30-minute background limit and recorded nothing.
The 8-mutant rerun took 33 minutes. Proposed change (prompts/ is control plane, so it needs its own PR):
`campaign --suite '<argv>'`, stored in the record's `test` so `rerun` uses it too. Or try the sibling
`<stem>.test.mjs` first and run the whole venture only for the mutants it misses. Metric: mutants per
campaign on targets whose venture suite takes over 60 s. Until then, give a slow venture
`--mutants 6` to 8 and the 2-hour background timeout.
