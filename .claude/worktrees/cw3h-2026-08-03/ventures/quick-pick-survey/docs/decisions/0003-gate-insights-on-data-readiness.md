# 0003. Insights unlock on data readiness, never on level

**Status:** accepted

## Context

The obvious design for a swipe app is to attach insights to levels: level 3
unlocks your top pick, level 8 unlocks the full ranking. It is easy to build,
easy to explain, and it is what every comparable app does.

It is also dishonest in both directions. Someone whose answers happened to
cover one category thoroughly can have a statistically solid top pick at 12
swipes and be told to keep going. Someone who scattered their answers across
everything can hit level 8 with nothing the data actually supports, and be
shown a "full ranking" that is mostly the 1500 default.

The second case is the dangerous one: the app would state something with
confidence it had not earned, which is the failure mode the product is
supposed to avoid (see docs/product-goals.md).

There is also a plainer cost. Withholding an answer the data already
supports is friction wearing a progress bar, and for the invited partner —
who did not choose to be here — friction in the first minutes is the thing
that ends the session.

## Decision

Each insight in `src/lib/insights.ts` declares what it needs, and is shown
the moment the data can support it. Levels still exist, but only to mark
progress and make swiping feel rewarding. They gate nothing.

Every insight also carries a `needs` string in plain language — "answers
spread across a few different kinds of thing" — shown in place of the
insight until it is ready.

## Consequences

- Two people at the same level can see different insights. That is correct,
  and the `needs` line is what makes it legible rather than confusing.
- `needs` is strictly more useful than "Level 8", because it tells someone
  what to do to get the thing they want.
- Readiness must be computed per insight from real state (item coverage,
  rating deviations, which surveys have been answered), not approximated
  from a count. That logic lives in `/api/insights` and is the part to check
  first when a card never fills in.
- `InsightDef` deliberately has no `level` field, and a test asserts it stays
  that way — reintroducing one would quietly restore the old behaviour.
