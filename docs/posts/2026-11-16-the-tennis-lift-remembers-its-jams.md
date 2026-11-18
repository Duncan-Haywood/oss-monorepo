---
title: "The tennis lift remembers its jams: a wear count that survives power-off"
seo_title: "A jam counter in ESP32 flash that flags a clutch re-set"
date: 2026-11-16
tags: [open-tennis-robots, firmware, hardware]
description: "The open tennis feeder's firmware now counts every lift jam in flash and flags the slip hub for a bench re-set after 300, the figure its wear model allows."
---

The open tennis-ball feeder lifts balls back to its hopper on a cleated
belt. When a ball jams, a friction slip hub lets the pulley slide while a
current comparator cuts the motor. [This morning's wear model](2026-11-16-open-tennis-robots-slip-hub-wear.md)
found that every one of those slides wears the hub's facings. The four disc
springs that now squeeze the hub keep its torque in the tested band for
about 300 jams after a bench set. After that the hub needs checking on a
luggage scale and setting again.

Nothing was counting to 300. The firmware knew when it cut a jam, but only
in RAM. A drill session sees a few jams at most, and the board restarts
whenever the battery is switched off between sessions. A counter that
starts again at every power-up never reaches 300. The build notes said to "check
it after 300 jams", and no owner keeps that tally by hand.

**What changed.** The ESP32 firmware now keeps the count in a small file
on the board's flash (`controller.JamLog`). It writes the file once per
cut, which is rare enough that the flash's wear levelling never notices.
Each cut adds one, and so does a retry's second cut, because each is a
separate slide of the hub. The write goes to a temporary file that is then
renamed over the old one, so a power cut in the middle leaves either the
old count or the new one. After 300 cuts since the last set, telemetry
raises a new flag, `FLAG_LIFT_HUB_DUE`. The Pi's drill runner reports it
once and carries on, since a hub near the end of its budget still works.
Once the hub has been set again, `tennisbots lift-hub-reset` sends a keyed
command that zeroes the count since the set and keeps the lifetime total.

**Two edge cases.** A missing file means a new board, so the count starts
at zero. A file the board cannot read is a different matter: maybe a write
from older firmware was cut short, or the flash was corrupted. If that read
as zero, it would hide a worn hub for another 300 jams. So an unreadable
count raises the flag at once, and a person who has just checked the hub
clears it with the same reset.

**How it was tested.** The tests load the real `main.py` against a fake
board, the same harness the jam sweep uses. Each simulated board gets its
own flash file. One test stalls the lift and sees two cuts counted. It then
starts a second board on the same file, which is a power cycle, and the
count is still there. Another test starts at 299 cuts, and one more stall
raises the flag. A drill then runs to the end with the warning logged
once. A reset with the wrong key is dropped, and the right one clears the
flag. The suite also checks that the firmware's `LIFT_SLIP_JAMS` matches
the CAD's `lift_slip_jams`. If someone changes the wear budget in one place
and not the other, a test fails.

**What is not known.** None of this has run on an ESP32 yet. The figure of
300 is only as good as the wear model behind it, and that model rests on an
assumed facing wear rate. A real hub on a real scale will say whether the
true number is 300, 3,000 or 30. The count makes that easy to find out: set
the hub, run a season, and read how many jams it took before the scale
disagreed. The code, the wear model and the CAD are MIT-licensed in
`ventures/open-tennis-robots`.

Next on this machine: the protocol has a hopper-empty flag that nothing
sets. An empty tub now ends a drill with a release timeout, not a clear
message. A break-beam over the ball column would fix that.
