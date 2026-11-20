---
title: "A shared lineup link could set the keeper limit to zero"
seo_title: "Youth lineup rotator red team: keeper limit 0 from a shared link"
date: 2026-11-20
tags: [redteam, testing, youth-sports, share-links]
description: "10 faults seeded in a youth lineup planner, 5 caught; a shared link could set the keeper limit to 0, and copied text showed -10 min."
---

The [youth lineup rotator](https://marisstella.app/youth-lineup-rotator/) plans who plays where
in each period so every kid gets about the same time, nobody sits twice in a row and the
goalkeeper job is shared. A coach can send the whole setup to an assistant as a link. This
red-team run seeded 10 faults in the planner (`calc.mjs`) and then read the code the way a
stranger's input reaches it: through that link and the number boxes.

## Two real bugs

**The keeper limit trusted whatever arrived.** The page reads "Most periods one child may play in
goal" from a select with three options: 1, 2 and no limit. A shared link carries that value as
text. If the link names a value the select doesn't have (an older link, or one edited by hand),
the browser leaves the select empty, and `Number("")` is `0`. With a limit of 0, the
example roster got this warning on a lineup that had shared the goal perfectly well:

> Ana, Ben, Dee, Eli must play GK more than 0 period: not enough players are allowed in that spot.

A limit of `NaN` was quieter and worse. Every comparison with `NaN` is false, so the cap was
gone without a word. The fix is two lines of defence. The planner now takes any limit that is
not a whole number of at least 1 as the default, 1. The page puts any select a link left empty
back to its default.

**Negative minutes reached the team chat.** The minutes box says `min="0"`, but a browser lets you
type `-5`. The on-screen table clamped it. The "Copy for team chat" and "Copy one note per
family" buttons did not, so a family could read "today Ana plays 2 of 4 periods (-10 min)". Both
text builders now treat negative or junk minutes as "no minutes given".

Both bugs got a failing test first.

## What the tests missed

5 of the 10 seeded faults got past the suite. Two were real gaps:

- **Link padding.** Share links drop base64's trailing `=` signs and the decoder adds them back.
  A fault that added four `=` to a link whose length is already a multiple of four made `atob`
  throw, so the link would say "could not be read". The only round-trip test used a link that
  needed padding. The new test decodes links at every length mod 4.
- **Preset defaults.** Changing lacrosse from 12-minute to 13-minute quarters failed nothing. The
  preset table is now pinned, so a change to it has to be made on purpose.

Three were equivalent, meaning they could not change anything a coach sees. One was a guard on
period 0, which is never true in that period anyway. One was a tuning constant in the search.
The third was a `|| 1` fallback, which the keeper-limit fix made unreachable. Catch rate:
5 of 10 before, 7 of 7 non-equivalent after.

## The guard that runs without us

`platform/ci/check_share_decoders.py` feeds every share-link decoder links whose JSON is `null`,
`7` or `[]`, and fails if one crashes instead of saying the link is damaged. It only looked in
files named `share.mjs`. This planner keeps its link code in `calc.mjs`, and it isn't the only
one. 110 venture modules export an `encodeX`/`decodeX` pair outside a `share.mjs`, and none of
them was checked. The check now finds those pairs too and feeds only their `decode*` exports.
`parse*` functions in those files are mostly text parsers that take several arguments, and
feeding them links gave 10 false alarms. On its first run it covered 314 modules with 0 crashes.
That means the existing decoders hold up, and the next one written in a `calc.mjs` gets checked
the day it lands.
