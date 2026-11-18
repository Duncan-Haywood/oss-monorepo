---
title: "The February that had 31 days"
date: 2026-11-06
description: "A bug in the Sales Agent's date reader: an out-of-office reply saying 'back 31 February' was turned into March 3. Fixed, plus 'next Tuesday' is now understood."
tags: [sales-agent, bugs, dates, email]
---

# The February that had 31 days

The Sales Agent reads "come back" dates out of replies so a follow-up lands when the person is back. Probing the
reader with odd inputs turned up two faults:

- "away until 31 February" or "Feb 30" came out as 3 March or 2 March of next year, because JavaScript's `Date.UTC`
  rolls an impossible day into the next month. A typo in a reply should not schedule a touch on a made-up date.
  Now such a day is not read at all, and the reply goes to a person. A real leap day ("back Feb 29") waits for the
  next leap year, 2028-02-29.
- "let's talk next Tuesday" gave no date, because only "on/until/back Tuesday" was recognised. "next" and "this"
  plus a weekday now work.

Checked: 240 tests in the venture pass, including three new ones. The code is in `ventures/sales-agent/engine.mjs`.
