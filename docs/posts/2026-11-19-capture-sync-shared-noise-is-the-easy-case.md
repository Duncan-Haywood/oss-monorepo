---
title: "Audio sync of phones: noise both microphones hear is the easy case, and a simulation bug nearly said otherwise"
seo_title: "Audio sync: shared room noise helps, independent noise is worst"
date: 2026-11-19
description: "Making a quarter of the noise shared between two phones cut simulated sync failures by three quarters; a recording-reuse bug first said the opposite."
tags: [research, capture-sync, audio-sync, digital-twin, simulation]
---

The [capture-sync](../../research/capture-sync/) programme asks how often a few seconds of sound can sync two free-running cameras or phones to within one video frame (33.3 ms at 30 fps), and whether a confidence score can say when not to trust an estimate.

Almost every earlier step gave each device its *own* noise: a separate recording of an air conditioner, a crowd or a keyboard for each microphone. A real room is not like that. The air conditioner reaches every microphone; a keyboard is mostly heard by the phone next to it. So this step mixed the two. Each device's noise was part shared (one source, played through the room to both devices 3 m apart) and part independent, with the total held at -10 dB below the speech, ten real noise types from MS-SNSD, two simulated rooms and 120,000 two-second windows. Eight predictions were written down before the run.

**Shared noise behaves like signal.** Within about 11 m, any sound both devices hear arrives within one frame of the true clock offset, so locking onto it is not an error. With a quarter of the noise power shared, failures summed over the ten types fell from 3.3 to 0.7 for plain partial-whitening correlation, and from 1.1 to 0.14 for the envelope-normalised estimator the programme now uses by default. A one-line rule counts the shared part as signal: the effective SNR is 10 log10((1 + 10 rho) / (10 (1 - rho))) for a shared fraction rho. It predicted the failure rate for all seven steady and speech-like noise types. It missed for repeating sounds both devices hear, such as regular typing and looped door recordings, where plain correlation still failed 2-27% of the time. The normalised estimator fixed the typing but not the doors.

**The confidence gate held at every mix.** A threshold calibrated with fully independent noise, the worst case, kept wrong-among-accepted windows at 0.1-1.0%. The share of windows it accepted rose from 64-70% to 98-99% as more of the noise was shared. A rig calibrated with a noise source next to each microphone is therefore being conservative.

**The first run said the gate failed.** It reported 4-6% wrong at mixes of a quarter to a half shared, and some noise types failing *more* when partly shared than at either extreme. Vacuum-cleaner windows failed 19% at a quarter shared, against 2.5% and 0% at the two ends. The wrong estimates were spread across the whole two-second search, not near any real sound's lag. The cause was the simulation itself. The shared stretch was drawn from all of a type's recordings, and each device's independent stretch from its own half. So in 7-30% of windows, one device's "shared" noise and the other device's "independent" noise were the same recording at an arbitrary offset. No real room does that, and correlation found the copy every time. A corrected run redrew any shared stretch that matched an independent one, with the threshold chosen after the diagnosis and the redraw rule written down before the rerun. Both runs' results are in the repository.

The lesson reaches beyond this project. A digital twin that builds "different" noises from one corpus can give two sensors the same recording. Any correlation-based method will then find a structure that the real world would never offer it. One cross-correlation check per window would have caught it.

Simulated rooms only: real phones (the LibriWASN recordings) were out of reach in this session. Code, results and the full log: [research/capture-sync](../../research/capture-sync/).
