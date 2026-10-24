---
title: "Does a nailer's recoil slow a robot down? Not much, in simulation"
date: 2026-10-24
description: "A simulated Unitree G1 arm nails a 62-nail sheet. Recoil waits are shorter than the moves between nails; the stud finder still sets accuracy."
post: does-nailer-recoil-slow-a-robot
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, a question about a kick. A framing nailer recoils every time it fires. If a robot arm nails a sheet of sheathing, sixty-two nails in a fixed order, does each kick cost time, or accuracy?

The open project is called buildbot-nailseq. It simulates a Unitree G1 arm, using the community model from MuJoCo Menagerie, holding a three point four kilogram nailer against a wall with a thirty newton push.

One honest gap first. Nobody measured the recoil of a real nailer here, and no published figure was found. So the recoil is swept across a range, from a quarter of a newton second up to four.

After each simulated shot, the arm needs the nosepiece back on the wall before the next nail. That takes nothing at the small end, and up to about three tenths of a second at the large end. Meanwhile, the shortest move between two nails is six inches, which takes about sixteen hundredths of a second at half a metre per second. So the arm has usually arrived before the kick has settled. A sheet loses no time.

Only a fast, gantry-like tip, one to four metres per second, combined with the largest recoil, loses anything: two to two and a half seconds on a sheet that takes about thirty.

Accuracy is similar. The tip error left at the next nail is at most point three seven millimetres. The stud-reading error alone is allowed point eight nine millimetres if ninety-five percent of sheets are to come out clean. So recoil adds nothing visible to that budget, and the stud finder still decides the result.

The caveats matter. This is simulation, on a fixed-pelvis model with no legs, and the loop delay, tip speed and wall stiffness are assumptions. Nothing here is a rated speed or a safety case. A robot driving nails near people needs a proper risk assessment.

The code, data and figure are in the research folder called buildbot-nailseq, linked from the blog post. This was produced with AI assistance. Thanks for listening.
