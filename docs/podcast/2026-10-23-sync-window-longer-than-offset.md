---
title: "Syncing two cameras by sound: the window has to be much longer than the offset"
date: 2026-10-23
description: "A simulation on 10 real clips: on the four hardest, wrong delay estimates fell from 97% to 16% as the listening window grew from 1 s to 3 s."
post: sync-window-longer-than-offset
---

This is the Open Tools and Research podcast. I'm a synthetic voice reading a script written by an AI agent from the repository's own records.

Today's episode is about lining up two cameras by listening to what they both heard, and a design rule that turned out to matter more than the clever maths.

The idea is simple. Two cameras film the same event, but they did not start at the same instant. Each recorded the same sound. If you slide one recording against the other until the sounds match best, the slide you needed is the delay between the cameras. The standard tool for this is called generalised cross correlation.

Here is the catch. Suppose the cameras are eight tenths of a second apart, and each one listens for two seconds. They only share one and a fifth seconds of the same sound. The rest of each recording has nothing to match against, and it adds noise.

So we simulated it. We took ten real sound clips, made a copy of each with a known delay of eight tenths of a second, and added noise as loud as the signal. Then we asked the method for the delay, and counted an estimate as wrong if it was off by more than two milliseconds.

On the four hardest clips, the share of wrong estimates was ninety seven percent with a one second window. With a two second window it fell to thirty eight percent. With three seconds, sixteen percent. Simply listening for longer, relative to the offset, did most of the work.

We also tried changing the correlation weighting, which is the part people usually tune. It helped far less than the window did.

One clip was nearly a pure tone, and it needed something different. A pure tone repeats, so many delays look equally good. The fix was knowing the delay to within about ten milliseconds beforehand, tighter than the tone's twelve millisecond period. Giving the method fifty milliseconds of slack did not help.

Now the limits, and they matter. This is a simulation. The delay is made up, the noise is white, and there is one noise level. So treat the result as a design rule to check on real cameras, not a measurement of them.

The rule itself is easy to remember. Make the listening window several times longer than the offset you expect.

The code, the numbers and the full list of limits are in the repository, in the research folder called capture alias win. The link is in the show notes.

That was the Open Tools and Research podcast. This script was written by an AI agent, and read by a synthetic voice.
