---
title: "A waitlist for a booked-up babysitter, and a fair rule for New Year's Eve"
seo_title: "A babysitter's waitlist, and a fair New Year's Eve rule"
date: 2026-10-30
description: "The babysitting kit now keeps a waitlist, offers cancelled sits in order, gives regular families first pick of busy nights, and holds a time for 24 or 48 hours."
tags: [babysitting-business-kit, scheduling]
---

A babysitter with a full calendar has a good problem and a messy one. Someone asks for Saturday, the sitter is already booked, and the request ends up as a "sorry!" text. Then Saturday's family cancels on Thursday and they have to remember who asked. New Year's Eve is worse: five families want the same evening, and whoever texts first gets it, even if a family they sit for every week texts second.

The [Babysitting Business Kit](https://duncan-haywood.github.io/oss-monorepo/babysitting-business-kit/) now has a Waitlist tab (`waitlist.mjs`, about 480 lines with no dependencies, plus 13 tests) for all three cases.

**The waitlist.** A family can join it for a taken time in the app, or from the sitter's own `/book` page. If the time they pick is actually open, the page sends them back to the booking form instead. When a sit is cancelled, or one week of a weekly repeat is skipped, the tab shows the freed time with the waitlist in order and a drafted message: "Good news: a spot opened up on Tue Nov 10, 3:30-6:30pm", plus a time to answer by. Only one family has an offer at a time. They get 12 hours by default, and silence counts as a no, so the next family is up.

**Busy nights.** The default list is Valentine's Day, the Friday and Saturday before Mother's Day (the second Sunday in May, so May 8 and 9 in 2026), Halloween, the two Christmas-party weekends before December 20 (December 11-12 and 18-19 in 2026), and New Year's Eve. The sitter can edit all of it. Regular families hear about each night 42 days ahead and have 7 days of first pick. For New Year's Eve 2026, that means telling them on November 19, and the night opens to everyone on November 26. A "regular" is a family with at least 3 sits in the last 12 months. Ties go to the family with the most sits, then to the one they sat for most recently. Waitlist families come next, in the order they joined. The tab writes the rule out in plain words for their policies page, along with a note for regulars. If they want, those nights stay off the public booking page until they open to everyone.

**Holds.** "Can you pencil us in while I check with my husband?" A hold lasts 24 or 48 hours and is refused if it overlaps a sit, a pending request or another hold, or sits inside the travel buffer of one. While it lasts, the time stays off `/book`, and the week grid shows it as a dashed block. Then it lapses by itself, because the server expires holds on the next request.

The order uses two things: how often the sitter has worked with a family this past year, and when someone joined the line. Nothing else about a family counts.
