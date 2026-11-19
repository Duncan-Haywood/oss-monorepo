---
title: "The tennis feeder's last wrongly advised instant contact was a rounding error; today's firmware reads 0"
seo_title: "Tennis feeder: the last wrongly advised instant contact, closed"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "One simulated build in 72 told builders to flash a 3.5 ms contact for an instant one. Unrounded it was never advised; recaptured today, 0 of 72."
---

The open tennis-ball feeder's ESP32 surveys how long each ball stays in
contact with the launcher wheels. It refits every ball's speed drop at nine
assumed contact times and tells the builder whether to change `TAKE_US` in
the config. Advice that sends a builder to flash a wrong number is the
failure that matters most, and since yesterday one simulated build had done
it: an instant contact, read as 3.5 ms, with the survey's best fit 57% of
the instant fit's error. The cut-off for advising is 60%.

## What the stored row showed

Most balls can't tell the candidates apart. When a contact fits inside one
wheel revolution, every candidate fits it the same way. On this build the
4 ms candidate won by having no ball on which it alone fitted badly. Two
balls fitted the instant model alone at 11 and 17 ppm against 2 to 5 for
every other candidate, while other balls had the same kind of lone jump on
other candidates.

The 57% itself was 4 / 7. The board sends each candidate's error as a whole
number of parts per million, and at a 4 to 7 ppm floor that rounding is
large. Unrounded the share was 0.635, which would not have been advised.
Across all 39 stored survey sets (1,821 builds) rounding flips the advice on
three builds, and no instant build is advised on any of them. A
conservative share that allows for the rounding would have dropped four
correct advisories and saved none, so it wasn't built.

## Recaptured on today's firmware

The rule went into the repository before the run. Recapture the same four
simulated sets on today's tree (a nine-point grid, stretched take offsets,
take-blind balls left out) and close the item only if no instant build is
advised and the named build reads 0.

| set | instant builds advised | spread contacts named and advised |
| --- | --- | --- |
| design | 0 of 18 | 38 of 54 (44 on the stored rows) |
| first held out | 0 of 18 | 48 of 54 (42) |
| fresh | 0 of 18 | 54 of 54 (54) |
| third | 0 of 18 | 54 of 54 (47) |

Both clauses held, and the named build now says "keep TAKE_US = 0". Its
error climbs from 6 ppm at the instant model to 360 ppm at 8 ms, where the
stored row had been flat.

## The one set that got worse

The design set fell from 44 to 38. Changing one setting at a time on its
worst build pointed at last night's ball-hold change, which softens the
wheel loop's gains on a wheel faster than the board was told. With that
change off, the build read correctly. A paired run of 96 builds put it in
proportion: 66 of 72 contacts named and advised with the change and 68
without, with no instant build advised either way. Two builds in 72 isn't
enough reason to switch the gains off during calibration drills, so the
change stays. The rest of the drop is at higher tach jitter and is the next
thing to trace.

Everything here is simulated. Whether real contacts are short enough for
any of this to matter has not been measured. The write-up is in
`ventures/open-tennis-robots/eval/take-instant-sub8-2026-11-19.md`.
