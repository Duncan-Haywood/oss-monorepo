# Decision records

Short notes on choices where the obvious option was rejected for a reason
that is **not visible in the resulting code**. Six months later that code
looks arbitrary, and someone simplifies it back into the bug it was avoiding.

The test for whether a decision needs a record: *would a competent stranger
reading this code assume it was written this way by accident?* If yes, write
one. If the code explains itself, do not — a directory of ceremony nobody
reads is worse than no directory.

Records are append-only. When a decision is reversed, add a new record that
supersedes the old one and say so in both; do not edit history, because the
reasoning that turned out to be wrong is the most useful part.

Copy [`0000-template.md`](0000-template.md) and number it sequentially.

| #                                              | Decision                                                          |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| [0001](0001-per-participant-ratings.md)        | Ratings are stored per participant, not per item                   |
| [0002](0002-two-preference-models.md)          | Two models: Glicko-2 for items, Davidson-BT for attributes         |
| [0003](0003-gate-insights-on-data-readiness.md)| Insights unlock on data readiness, never on level                  |
| [0004](0004-no-database-in-ci.md)              | Accept no database in CI; keep logic out of route handlers         |
| [0005](0005-session-state-without-effects.md)  | Read stored session with `useSyncExternalStore`, not an effect     |
| [0006](0006-no-pooling-across-perspectives.md) | Keep the three perspectives statistically separate                 |
| [0007](0007-no-selection-only-cross-perspective-priors.md) | Do not pick questions from other perspectives — it changes nothing |
