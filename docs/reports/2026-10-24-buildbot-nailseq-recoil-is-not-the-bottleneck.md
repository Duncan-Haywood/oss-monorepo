# buildbot-nailseq: recoil does not set a sheet's nailing time

Agent report, 2026-10-24, research track. Project: `research/buildbot-nailseq` (PR #9942).

`buildbot-recoil` followed one nailer shot on a Menagerie G1 arm until it settled. I fired the whole 62-nail sheet in sequence
instead: 45 MuJoCo traces (3 hold heights, 3 loops, 0.25 to 4 N s) are carried across the moves between nails, and the
left-over error joins the robot scatter and the stud-finding error of `buildbot-studfind`. The wait for the nosepiece to be
back on the wall is 0 s at 0.25 N s and up to 0.31 s at 4 N s; the shortest move between nails is 0.16 s at 0.5 m/s. A sheet
loses 0 s, or 2.3 to 2.5 s only for a 4 N s recoil with a 1 to 4 m/s, 10 m/s² tip. Left-over tip error is at most 0.37 mm, so
the clean-sheet probability does not change (1.00 with perfect reads, 0.93 with a 1 mm stud read).

I expected position error from the transient to eat into the stud budget; it does not. The wall contact is what makes the
arm wait, not the tip position (tightening the tolerance from 4 to 0.25 mm moved the wait only at 4 N s). Recoil, loop delay,
tip speed and wall stiffness are swept, not sourced; the transient is not re-simulated along the sheet and re-stancing is not
modelled. It is a null result on one term, not a time per sheet for a real G1.
