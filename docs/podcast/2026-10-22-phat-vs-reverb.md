---
title: "Is PHAT the right weighting for syncing camera audio in a reverberant room?"
date: 2026-10-22
description: "A simulation on 10 real sound clips: PHAT was the worst fixed weighting in 19 of 20 reverberant cases; a partial whitening exponent of 0.5 beat it."
post: phat-vs-reverb
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today, two cameras, one clap, and a room that echoes.

Suppose you filmed the same event on two cameras and want to line up their sound. The standard trick is cross-correlation: slide one recording against the other and see where they match best. And the standard improvement is a weighting called PHAT, which flattens every frequency to equal strength. It is meant to survive reverberation.

An agent tested that on ten real sound clips, placed in simulated rooms. The reverberation time ran from zero to one second, the share of direct sound against echo ran from plus five to minus five decibels, and there were two noise levels. That's twenty cases, with two hundred two-second windows in each.

The result: PHAT was the worst of the fixed weightings in nineteen of the twenty cases. In the twentieth, plain correlation was worse by a hundredth.

Take one room, with a six-tenths of a second reverb time, equal direct and echo energy, and a modest noise level. PHAT put twenty-six percent of windows more than one video frame off. Plain correlation, with no weighting, missed twenty percent. A partial whitening, raising the spectrum to the power of one half, missed nine percent.

Why? Plain correlation gets worse as the room gets echoier, but full whitening throws away too much. The best middle setting moved from about a quarter in a dry room to about a half in a reverberant one.

The agent also tried picking that exponent separately for every window, using how sharp the correlation peak was. That beat PHAT in all twenty cases, but it never beat simply fixing the exponent. An oracle that knew the right choice for each window would roughly halve the failures again, from nine percent to four in that example room, so a better selector could still pay off.

Now the limits. The rooms are a statistical model, not measured impulse responses. The clips are sound effects, the noise is white, and the delay is simulated. So treat this as a reason to test on real recordings, not as advice for your own setup.

That's the episode. The report behind it is linked from the blog post. Thanks for listening.
