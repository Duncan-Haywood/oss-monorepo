---
title: "Audio sync from a 2 s window: audio fingerprints and landmarks lose to cross-correlation by a factor of four"
seo_title: "Audio fingerprint sync vs GCC on short windows: GCC wins"
date: 2026-11-20
description: "Five audio sync methods from the multi-camera literature, tested on 62,000 two-second windows, failed at least four times as often as normalised GCC at -10 dB."
tags: [research, capture-sync, audio-sync, audio-fingerprinting, benchmarks]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of shared sound can line up two free-running cameras or phones to within one video frame (33.3 ms at 30 fps). It also asks whether a confidence score can say when an estimate should not be trusted. Until today every comparison in it was one cross-correlation (GCC) against another. That leaves an obvious objection: the multi-camera sync literature mostly does not use GCC at all.

Those papers compare coarser descriptions of the two recordings. Kammerl et al. (ICASSP 2014) cross-correlate frame-level audio features and report that spectral flatness beats zero-crossing rate and energy. Shrestha et al. (ACM Multimedia 2007) match audio fingerprints. Most open-source alignment tools vote over Shazam-style landmark hashes (Wang 2003). So this step reimplemented five of them: flatness, energy and zero-crossing-rate cross-correlation, Wang landmarks, and Haitsma-Kalker binary fingerprints. Each ran on the same 62,000 two-second windows the programme has used since step 3h: real read speech and ten kinds of real recorded noise in two simulated rooms, with the noise independent at each device. Seven predictions were written down before the run.

**None of the five came close.** At -10 dB the failure shares summed over the ten noise types were 1.1 and 1.3 for envelope-normalised GCC (the programme's default) in the two rooms. The best baseline, Haitsma-Kalker, scored 4.3 and 4.9, and the others 6.6 to 8.9, where 10 would mean every window failing. With no noise, every method but landmarks was perfect. Even then GCC's median error was 0.01 ms, against 0.4 to 2.6 ms for the baselines.

**Only GCC's confidence was usable.** A gate set for 1% wrong answers among the windows it accepts kept 74% of the -10 dB windows with GCC, at 1.9% wrong. No baseline kept more than 27%, and those it kept were 3-56% wrong.

**Two results from the literature did not reproduce here.** Spectral flatness lost to plain energy in both rooms. Landmark hashing did not shrug off a keyboard or a door heard by one microphone, though noise peaks that only one device hears should never match. It failed more often than plain GCC on all four impulsive noise types. A sweep run after the result, labelled as such, showed denser landmarks fix the clean case (11% failing down to 1-2%) but barely move the noisy one. Landmark voting is built for minutes of overlap between two uploads, not for two seconds.

**One baseline did teach something.** Haitsma-Kalker fingerprints beat plain GCC on every impulsive noise type in both rooms: door slams at 4% against 21%, typing at 21% against 78%. They lost badly on steady noise. Their bits keep only the sign of an energy difference, so a burst's size does not matter. That is the same idea as the envelope normalisation step 3h added to GCC, reached by a coarser route.

For a rig that re-syncs from short windows, the conclusion is that the waveform correlation this programme studies is the right tool, not just the one it happened to pick. The run did not test real phones (the dataset host was unreachable), longer windows where landmarks should recover, or Kammerl et al.'s consistency step across three or more recordings, which is where their method is strongest. Those are next. Code, results and the pre-run predictions are in the [project](../../research/capture-sync/).
