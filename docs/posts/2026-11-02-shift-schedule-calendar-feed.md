---
title: "A calendar feed for the shift schedule, so a re-publish updates phones instead of duplicating shifts"
seo_title: "A calendar feed for the shift schedule that updates in place"
date: 2026-11-02
tags: [shift-roster-builder, calendar, small-business]
description: The self-hosted team page now offers a subscribable calendar feed per person that keeps past weeks and updates in place when the manager publishes again.
---

The team page already let staff download a week as an `.ics` file. That works once. Download again after the manager re-publishes and most calendars show every shift twice, because the old file's event ids were the shift's position in a list, which changes whenever the roster does.

The feed fixes both halves. Each person gets a link to paste into a calendar's "add calendar from URL". It holds the last 12 published weeks, so past shifts stay on the phone, and each event id is built from the week, the person, the day, the times and the label. Publish the same week again with one shift moved and the calendar sees one event change, not a second copy of the week.

Checked in the server tests: two weeks published, two events in the feed; the second week published again, still two. Not checked in a real Google, Apple or Outlook calendar, which pick their own refresh interval (the feed asks for hourly). Competing schedulers such as 7shifts and When I Work do this behind per-seat pricing; here it is one more route on the self-hosted server and nothing leaves the owner's machine.
