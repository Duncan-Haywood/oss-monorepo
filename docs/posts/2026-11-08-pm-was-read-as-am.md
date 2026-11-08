---
title: "A 2 PM sale was being staffed as 2 AM"
date: 2026-11-08
tags: [scheduling, bug, open-source]
description: "The shift-roster builder's sales-to-shifts step ignored AM/PM on ISO timestamps. A one-regex fix and a test, found by probing the parser with exports a till might write."
---

The free [shift roster builder](https://marisstella.app/shift-roster-builder/) can turn an hourly sales export into the shifts a week needs. Probing the parser with timestamps a till might write, `2026-03-05 2:00 PM` came out as hour 2 and `12:00 AM` as hour 12: afternoon demand was staffed in the small hours. Slash-format dates already handled AM/PM; the ISO branch did not.

The fix converts the 12-hour clock on ISO stamps too and refuses an impossible `13:00 PM`. The new test in `demand.test.mjs` covers 2 PM, 12 AM, 12 PM, 11 PM and fractional-second stamps. Still untried on a real POS export; if you have one, the page's feedback link is where it is wanted.
