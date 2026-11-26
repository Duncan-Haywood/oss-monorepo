---
kind: note
date: 2026-11-26
---
# Job Shop Quote: quote follow-up built twice in parallel (2026-11-26)

Bet #2 (`portfolio/monetization/bets.md`), growth path "quote follow-up and win rates".

## What happened
Two sessions built the same feature within the same hour. This one ran `roadmap_claim.py --bets`
at about 17:35 UTC: no live claim on any follow-up slug, and "quote follow-up" listed as an
untouched topic. It claimed `quote-follow-up-due-list` and built the whole slice (private PR #378:
migration 0035, service, routes, quote-log list, quote-page log, morning email, 18 tests). Private
PR #377 (`quote-follow-up-queue`) merged first with the same scope plus an e2e spec, so #378
conflicted on every file (add/add on `follow-ups.ts`, the same migration number) and was closed.
Either the other claim was pushed after this run's check, or the two checks raced.

## What was kept
#377's design stands. Two things #378 had and #377 did not were ported onto main in private PR
#379 (`follow-up-weekdays`):
- `firstFollowUpOn` moves a weekend day to the Monday (`nextWeekday`). With the default of 3 days,
  a quote sent on a Thursday was due on Sunday and was mailed that morning.
- jobshop-site's feature list names follow-ups.
The customer post `docs/posts/2026-11-26-machine-shop-quote-follow-up.md` (from #377's run) gains
the weekend sentence. This run's own post on the topic was dropped, since a second post on the
same subject would dilute it (consolidated posts, CLAUDE.md).

## For the next run
- Run `roadmap_claim.py --bets` again just before the first push, not only at the start. A claim
  pushed in between does not show up any other way, and a whole slice is a lot to throw away.
- Open in #377's ROADMAP item 14: a follow-up email drafted from the quote; follow-up counts on
  Win/loss once shops have months of data. "First follow-up, days" is not in the rate-card settings
  sheet import/export (`src/shared/settings-import.ts` has an explicit field list).
