---
title: "Audio sync of cameras: a smart switch between two correlators did no better than always using one"
seo_title: "Audio sync: a kurtosis switch adds nothing over normalised GCC"
date: 2026-11-18
description: "A per-window switch on frame-energy kurtosis matched always-normalised GCC (11.5-12.5% of windows a frame off, plain GCC 33-35%) but was no better."
tags: [research, capture-sync, audio-sync, negative-result]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of sound can sync two free-running cameras or phones to within one video frame. Its last step found a simple fix for keyboard clicks, bites and door slams heard by one device only. Each device's audio is divided by its own 32 ms loudness envelope before the cross-correlation. Typing noise at -10 dB went from 78% of windows a frame off to 0.1%. The fix had a cost, though. On steady noise such as an air conditioner it made things worse, 12-16% of windows off to 21-23%.

The obvious next move was to run both correlators and pick one per window. This step tried the cheapest picker: the window's own frame-energy kurtosis, which is high when the energy comes in bursts. Bursty windows would get the normalised correlator and steady ones the plain one. The threshold was fitted on half the sessions and tested on the other half, with the nine predictions written down before the run. Step 3c's 62,000 windows were replayed bit for bit, with ten noise types and two rooms.

It didn't work, and the reason is simple. **Speech is bursty too.** Read speech has pauses between words, so a clean window's kurtosis (median 0.93-1.02, log10) is higher than most noisy windows'. A threshold low enough to keep the air conditioner on plain correlation would also have sent clean speech there. So the fit put the threshold at 0.57-0.61, and the switch sent 94-100% of windows to the normalised correlator.

At -10 dB, averaged over ten noise types:

- **Plain correlation:** 33.0% and 35.2% of windows more than a frame off (the two rooms).
- **Always normalise:** 11.3% and 12.5%.
- **Kurtosis switch:** 11.5% and 12.5%. Air conditioner improved a little (18% and 22%), but only about a quarter of the cost came back.
- **Pick whichever has the higher peak-to-sidelobe ratio:** 17.5% and 18.9%. This is worse because plain correlation's wrong peak on a click train is sharp, so it wins the vote on a third of typing windows.
- **An oracle that knows which one is right:** 7.8% and 8.9%. Most of that remaining gap is babble and copy-machine noise, where the two correlators fail on different windows. It is not steady noise.

Five of the nine predictions held and four failed. The practical answer for anyone building a multi-camera rig is to always normalise. A switch that pays would need a feature that describes the noise alone, not the whole window, and that is not tested yet. All of this is simulated rooms with one speech corpus (MS-SNSD) and noise recorded separately at each device. Real phones are the next check. The [README](../../research/capture-sync/README.md) has the table and [LOG.md](../../research/capture-sync/LOG.md) has the predictions as written.
