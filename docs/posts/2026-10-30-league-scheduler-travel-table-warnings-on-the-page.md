---
title: "A travel table with a hole in it now says so on the page"
date: 2026-10-30
tags: [league-schedule-generator, scheduling]
description: "The multi-division league scheduler warns about a missing venue pair or a typo'd travel time on the page, not only on the command line."
---

The multi-division league scheduler prices venue changes with a travel table you type in, one line per pair such as `Park - School: 25`. A pair left out is priced as the longest time listed, which overstates it without any sign. A direct time longer than going via a third venue is usually a typo.

Earlier today the command line began to warn about both. The multi-division page now shows the same warnings in a "Travel table" notice above the schedule. The schedule still builds, since these are soft checks. Most league organisers use the page, so the warning reaches the people who make the typos.

The page test checks that the page reads the warnings and renders the notice. It does not drive a browser through it. Still open: a real league's travel times to try this on.
