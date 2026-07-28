# 0001. Ratings are stored per participant, not per item

**Status:** accepted

## Context

The first version kept a single `Item.rating` — one Glicko-2 state per item,
shared by everyone. Every answer from any visitor moved the same numbers.

That is fine for a public leaderboard and fatal for this app. The schema
could not express "her ranking"; it only had "the ranking", mixed across
everyone who had ever opened the URL. With zero malice, one person trying
the app themselves put their taps and their partner's into the same dataset
with no way to separate them. With any malice, the link is public and anyone
with curl could drive every ranking anywhere in seconds, after which the UI
would display the result at high confidence.

It also made the couple comparison — the whole point — impossible to
compute, and made per-person progress and confidence meaningless.

## Decision

A `ParticipantItemRating` row keyed by (participant, item) holds the
Glicko-2 state. Rankings are computed per participant. `Item` carries
content only.

A `Participant` is one person's run at one survey under one perspective, so
the same user rating activities "for myself" and "in a partner" has two
independent sets of ratings that share nothing.

## Consequences

- The couple comparison, per-person confidence and progress all become
  computable. Almost every output in the app depends on this.
- Reads cost a join and a fallback: `loadRatedItems` fills in the Glicko-2
  defaults for items a participant has never been shown. Untouched items are
  not stored, so an abandoned session costs one row per *answer*, not per
  item.
- Rating deviation doubles as a "was this ever shown?" flag —
  `rankingFor` discards anything at rd ≥ 349 as carrying no signal. That
  coupling is load-bearing; changing the Glicko-2 default deviation would
  silently change which items are considered rated.
- The per-trial before/after snapshots on `Trial` mean the historical record
  survived the migration intact.
