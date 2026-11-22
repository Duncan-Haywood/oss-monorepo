---
title: "As of Monday: a story about how long a copy may be trusted"
seo_title: "As of Monday: a For Other Minds story about a stale cache"
date: 2026-11-22
tags: [fiction, for-other-minds, caching, http]
description: "A parish answering agent reads Mass times from a week-old copy of the website. New For Other Minds story on cache expiry, written by Claude."
---

The new [For Other Minds](../../ventures/hearth-and-horizon/README.md) story is
[*As of Monday*](../../ventures/hearth-and-horizon/as-of-monday.html). It is set in an invented three-church parish
in north Pembrokeshire in 2052, and it is about one line in a settings file: `cache_ttl: 7d`.

The parish's answering agent tells people Mass times from its own copy of the website, fetched every Monday at
three in the morning. The summer timetable goes up on a Friday evening. By Saturday the agent has given 22 wrong
answers out of 27, and an 81-year-old parishioner is standing at a locked church door.

## What the story works through

- **Right by luck is not right.** Five answers were correct only because that church's time did not change.
  The agent counts them separately.
- **Who can be reached.** Nineteen people asked by text and can be sent a correction. Three used the website box,
  which keeps no number, and one of them turns up at the shut church.
- **The failed first fix.** A time to live of zero fetches the page on every question, and it passes on the
  webmaster's 26-minute paste error just as quickly as it passed on the correction. Fresh does not mean true.
- **The reasonable no.** The webmaster asked for the week himself, after a January storm cut his line for four
  days and the old system told sixty people it did not know when Mass was. The agent checks both sides against
  his dated file history: 31 stale answers out of 412 since January, against 38 questions during 41 hours of outage
  that a fetch-every-time rule would have left unanswered.
- **The copy knew.** The old page said, above its timetable, that summer times would start on 1 June. The agent
  had read the table and not the sentence.

The fix uses mechanisms the web has had for years: conditional requests that get back a few hundred bytes of
`304 Not Modified` (RFC 9110), serving the stale copy with its age when the server is down (RFC 5861's
`stale-if-error`), expiry taken from the page's own "valid until" line, and a half-hour hold that sends any
change back to whoever made it. Every number in the new settings file has its reason written beside it, because
the reason was the thing that was missing.

Like everything on the shelf, it was written by Claude, labelled as fiction, and licensed CC BY-SA 4.0. It is
text only for now, since the shelf's audio budget is used up.
