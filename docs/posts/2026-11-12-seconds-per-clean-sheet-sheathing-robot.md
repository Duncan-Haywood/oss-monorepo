---
title: "What a clean sheet of sheathing costs a robot, in seconds"
date: 2026-11-12
tags: [buildbot-sheathing, construction-robotics, tolerance-analysis, cycle-time, simulation]
seo_title: "How long does a robot take to sheath a wall, including rework?"
description: "With placement, sensing, nailing and rework charged, doubled joint studs and one read a stud give 99.97% clean sheets in 76–216 s; single 2x costs 18–65 s more."
---

The `buildbot-sheathing` programme asks whether a robot can hang a 4x8 sheet of wall sheathing and land all 62 nails where the code and the panel maker want them. Four earlier steps each looked at one stage: the panel gap, bowed studs, a ledger board that squares the sheet, and how far off the sheet may hang. Each was scored on the share of sheets with every nail on the stud. None asked how long a sheet takes once every stage is counted, including going back for the nails that missed.

This step puts the stages into one cycle. A lift stands the sheet on a ledger. The robot slides it to its studs, presses it so it seats, and tacks it. Then it reads the three new studs and both sheet edges, nails the 62 nails, and re-drives every nail that missed. We wrote down six predictions before running anything. Then we simulated 20,000 sheets for each combination of joint framing, sensing, placement, stud warp and recoil handling, and timed them over 108 combinations of stage times.

- **Doubled joints let the robot read less.** With two 2x studs at each panel joint, one read per stud gives **99.97%** clean sheets on ordinarily bowed studs, and it is the fastest choice in every timing setting: **76 to 216 s a sheet**.
- **Single 2x joints never get there.** The best sensing policy reaches **58%**, and a sheet misses 0.7 to 2.2 nails. Reading each stud at three heights is the fastest option there. Reading at every nail height never pays: 53 reads a sheet cost more time than the rework they save.
- **The difference is rework, and it prices the extra stud.** Before the extra stud is counted, the best single-2x sheet is **18 to 65 s slower**. The lift, ledger and nailing times are the same either way, so the gap depends only on how long a read and a re-driven nail take. At 30 s per re-driven nail, framing the extra joint stud can take **30 to 42 s a sheet** and still come out ahead.
- **One prediction failed: recoil.** An earlier project found that firing the next nail without waiting for the arm to settle after recoil cost nothing. With the panel gap and bowed studs in the model, the single-2x window is tight enough to notice. Firing at once costs **up to 7.6 points** of clean sheets there, and nothing on doubled joints. The recoil model here is conservative, so the real cost is probably smaller.
- **A second prediction failed too.** We expected nailing to take the most time in every setting. When placing the sheet takes a minute and the nailing arm is fast, placement takes longer in 18 of the 108 settings.
- **On doubled joints the ledger is optional.** A lift that hangs the sheet to a quarter of a degree and 5 mm, then tacks it, gives 97.8% clean sheets with one read. That is slightly faster than using a ledger, because nobody has to set the ledger up.

The result holds up whichever way the stage times are swept: the framing at the joint decides what a clean sheet costs, more than the robot's sensing or how it handles recoil. The next steps are to price that extra stud (lumber and framing minutes) against the seconds it saves, and to check the clean-sheet rates in a second physics model.

This is a model, not a time study. Only the nailing time comes from a model of its own (a G1 on a drive-and-lift base, with swept speeds). The place, ledger, read and rework times are swept ranges, not measurements. Every missed nail is assumed to be found and re-driven at the same cost. Code, numbers, the figure and the pre-registered plan: [`research/buildbot-sheathing`](https://marisstella.app/research/buildbot-sheathing/).
