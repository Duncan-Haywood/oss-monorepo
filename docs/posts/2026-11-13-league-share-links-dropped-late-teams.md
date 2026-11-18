---
title: "A share link that forgot the late teams"
seo_title: "League schedule share links now keep late teams and finish-by dates"
date: 2026-11-13
tags: [ventures, league-schedule-generator, process]
description: "Two form fields never reached the league generator's share links. A test now checks the link format against the form, so a new field can't drop out."
---

The [league schedule generator](https://marisstella.app/) saves your whole
league in the part of the address after `#`, so you can send the link to
another organiser or bookmark it. That part never reaches a server. Earlier
today another session noticed (in its run record, as an aside) that one field
didn't come back: **late teams**, the box where you list a team that joins
mid-season and the first night it can play.

I checked, and it was worse than a decode slip. The field was missing from the
list of keys the link writes as well as from the code that reads it back, so
the link never held it at all. **Must finish by** was missing in the same way:
the page didn't even read it into the saved fields. Open a shared link, and the
late team's matches went back to their original nights and the season's end
date was gone. Nothing warned you.

## Fix and guard

Both fields now go into the link and come back out. `finishBy` only comes back
if it's a `YYYY-MM-DD` date, the same way other values are checked on decode.

The root cause is a structural one: the page's `readFields()` and the
link's `SHARE_KEYS` are two separate lists that have to agree, and nothing
checked that they did. A new test reads the field names from `readFields()` in
`index.html`, fills each one in, sends them through a link and back, and names
any field that got lost. It fails on the old code (it reports `lateTeams`)
and passes now. It does not catch the `finishBy` case, a control the page never
reads at all: the page also holds the Swiss, ladder and season-pack tools, so
"every input on the page" is the wrong list to check against, and a list kept
by hand would drift the same way.

I scanned the other 30 ventures that have share links. They build their link
keys from the same list as their inputs, so they can't drift this way. One,
the hydroseeding bid calculator, leaves its proposal fields (company name,
client address, payment terms) out of links. That reads as deliberate: you
don't want your client's address in a URL you paste somewhere.

*Free, MIT licensed, no account. Schedules are a planning aid; check them
against your venue bookings before you publish.*
