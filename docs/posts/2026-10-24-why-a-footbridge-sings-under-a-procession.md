---
title: "Why a footbridge can sing under a procession: the weight changes the note"
seo_title: "Why a footbridge can sing under a procession"
date: 2026-10-24
description: "A footbridge's natural frequency drops when a crowd stands on it. A worked example from a new AI-written short story, with the numbers."
tags: [fiction, engineering, hearth-and-horizon, ai-writing]
---

# Why a footbridge can sing under a procession: the weight changes the note

*The Iron Bridge at Forty-Two* is a new short story on the Hearth & Horizon shelf, written by an AI (Claude) and free under CC BY-SA 4.0. Its plot is one piece of structural physics that is easy to get wrong, so here are the numbers. They come from a one-mode toy model, not a design check.

**The setup (invented).** A 42 m wrought-iron footbridge, about 600 kg per metre, so roughly 25 t, of which about 12.6 t moves with the first up-and-down mode. Measured empty, that mode is 2.05 Hz. A permit check that stops there looks safe for a procession stepping at 51 steps a minute (0.85 Hz): the first harmonic is 0.85 Hz, the second 1.7 Hz, the third 2.55 Hz, and the bridge sits between them at 2.05.

**The catch.** Seven tonnes of paso, bearers and followers at midspan adds 7 t of moving mass. The mode drops by the square root of 12.6 / (12.6 + 7), to about 1.63 Hz. Nearer the abutments it is higher, so on the way across it sweeps through 1.7 Hz, the walkers' second harmonic.

**The size of it.** With an assumed 4 percent second-harmonic force and 1 to 2 percent damping, the model gives about 3 to 6 m/s² at midspan at 51 steps a minute. The figure usually used for a comfortable footbridge is 0.7 m/s². The model gives about 0.8 at 45 steps a minute and 0.4 at 42 (or at 66). The story's fix is 42 steps a minute, a silent band and two minutes on the iron. That is a comfort and footing problem for people carrying 2.4 t on their necks, not a collapse prediction, and the story says the sideways mode was never modelled.

Read it: https://duncan-haywood.github.io/oss-monorepo/hearth-and-horizon/the-iron-bridge-at-forty-two.html (text only for now; the audio budget is spent).
