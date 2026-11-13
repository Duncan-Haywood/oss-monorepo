# Programme proposal: capture-sync

**Frame-accurate audio sync of free-running cameras and phones, measured on real devices and rooms, with a confidence that says when not to trust an estimate.**

Opened 2026-11-13. Track 13 (`capture`, autonomous multi-angle capture), the question the 18 `capture-*sync*` and `capture-*audio*` projects have been circling on synthetic delays and gallery clips. AI-assisted research (Claude); no affiliation with the LibriWASN authors, Paderborn University or any camera maker is implied.

## Question

When several cameras or phones record the same scene on their own clocks, how often does a short window of their sound fix the offset between them to within one video frame, across real rooms, real noise and real clock drift, and can the estimator attach a confidence whose failure rate, set in one room or rig, still holds in another?

It is open because the three literatures that touch it each stop short of it. Multi-camera audio sync papers (Shrestha et al. 2007; Kammerl et al. 2014; Bano and Cavallaro 2016) report accuracy on their own user-generated sets, with no confidence that transfers. Sensor-network sync papers (Bahari et al. 2017; Gburrek et al. 2022) estimate clock-rate offsets from long, clean recordings and do not score the short windows a camera rig re-syncs from. And the threshold theory of time-delay estimation (Ianniello 1982; Weiss and Weinstein 1983) predicts when the peak jumps to a wrong lag under Gaussian signal and noise, but nobody has checked it on reverberant speech recorded by real devices. Our own projects found the problem on synthetic delays and gallery clips: on real sound, 2 s windows that never fail on synthetic noise fail 53% of the time at -10 dB (`capture-realaudio`), and the fix chosen on one set of clips does not carry to another (`capture-syncgate`, `capture-trackprior`).

## Why it matters

Every multi-camera capture rig needs its streams on one clock before an edit, a stereo depth estimate or a 3D reconstruction can use them, and a one-frame slip shows at a cut or tears a reconstruction. Studio rigs (the Panoptic Studio, Joo et al. 2015) buy genlock hardware; travel creators, field roboticists with consumer cameras on a mast, and wireless acoustic sensor networks do not have it. The number this moves is the share of the session that is out of sync, and the abstention rate (how often the system says "no estimate here" and holds its last clock line). An engineer building a capture box (track 13), a multi-camera robot head, or a WASN for meeting transcription would choose the window length, the weighting and the gate threshold from it, and would know the failure rate before deployment instead of after the edit.

## Related work

Every DOI and arXiv id below was looked up (`research/_shared/cite_check.py PROPOSAL.md`, results in `cite_check.json`).

*Time-delay estimation and its threshold.*
- Knapp and Carter (1976), "The generalized correlation method for estimation of time delay", *IEEE Trans. ASSP* 24(4), [doi:10.1109/TASSP.1976.1162830](https://doi.org/10.1109/TASSP.1976.1162830). The GCC family; PHAT is one weighting. Settles the high-SNR estimator; says nothing about gross errors.
- Ianniello (1982), "Time delay estimation via cross-correlation in the presence of large estimation errors", *IEEE Trans. ASSP* 30(6), [doi:10.1109/TASSP.1982.1163992](https://doi.org/10.1109/TASSP.1982.1163992). Predicts the probability that the correlation peak lands on a wrong lag (the threshold effect) for Gaussian signals. Not checked on speech, reverberation or real devices.
- Weiss and Weinstein (1983), "Fundamental limitations in passive time delay estimation, Part I: Narrow-band systems", *IEEE Trans. ASSP* 31(2), [doi:10.1109/TASSP.1983.1164061](https://doi.org/10.1109/TASSP.1983.1164061). Ziv-Zakai style bounds that mark the SNR-bandwidth-duration region where ambiguity dominates; Gaussian, stationary.
- Champagne, Bédard and Stéphenne (1996), "Performance of time-delay estimation in the presence of room reverberation", *IEEE Trans. Speech Audio Process.* 4(2), [doi:10.1109/89.486067](https://doi.org/10.1109/89.486067). Simulated rooms; reverberation, not noise, sets the floor. Single array, one clock.
- Zhang, Florêncio and Zhang (2008), "Why does PHAT work well in low noise, reverberative environments?", ICASSP, [doi:10.1109/ICASSP.2008.4518172](https://doi.org/10.1109/ICASSP.2008.4518172). Explains PHAT's advantage as a maximum-likelihood limit at high SNR; implies it loses at low SNR, which our `capture-realaudio` saw on dry clips and `capture-reverbsync` contradicted in simulated rooms.

*Multi-camera and audio-visual sync.*
- Shrestha, Barbieri and Weda (2007), "Synchronization of multi-camera video recordings based on audio", ACM Multimedia, [doi:10.1145/1291233.1291367](https://doi.org/10.1145/1291233.1291367). Audio fingerprints align consumer camcorder recordings; accuracy on their own recordings, no failure model.
- Kammerl et al. (2014), "Temporal synchronization of multiple audio signals", ICASSP, [doi:10.1109/ICASSP.2014.6854474](https://doi.org/10.1109/ICASSP.2014.6854474). Pairwise correlation plus a global consistency step over many uploads; offsets only, no drift, no per-estimate confidence.
- Bano and Cavallaro (2016), "ViComp: composition of user-generated videos", *Multimedia Tools Appl.* 75, [doi:10.1007/s11042-015-2641-2](https://doi.org/10.1007/s11042-015-2641-2). Audio sync is a front end to automatic multi-camera composition, the task `capture-edit` targets.
- Chung and Zisserman (2017), "Out of time: automated lip sync in the wild", ACCV workshops, [doi:10.1007/978-3-319-54427-4_19](https://doi.org/10.1007/978-3-319-54427-4_19). Audio-to-video offset within one camera, learned; a different problem (one clock, two modalities) but the model for a learned confidence.
- Iashin, Xie, Rahtu and Zisserman (2024), "Synchformer: efficient synchronization from sparse cues", ICASSP, [doi:10.1109/ICASSP48485.2024.10448489](https://doi.org/10.1109/ICASSP48485.2024.10448489), and Iashin et al. (2022), "Sparse in space and time", [arXiv:2210.07055](https://arxiv.org/abs/2210.07055). State of the art for audio-visual offset classification on in-the-wild video; offsets in classes of 0.2 s, not sub-frame, and no cross-device clocks.
- Joo et al. (2015), "Panoptic Studio: a massively multiview system for social motion capture", ICCV, [doi:10.1109/ICCV.2015.381](https://doi.org/10.1109/ICCV.2015.381). The hardware-synchronised alternative; what a rig without genlock has to approach.

*Clock drift in acoustic sensor networks.*
- Lienhart, Kozintsev, Wehr and Yeung (2003), "On the importance of exact synchronization for distributed audio signal processing", IEEE WASPAA, [doi:10.1109/ASPAA.2003.1285842](https://doi.org/10.1109/ASPAA.2003.1285842). Sampling-rate offsets of consumer devices and what they break.
- Miyabe, Ono and Makino (2015), "Blind compensation of interchannel sampling frequency mismatch for ad hoc microphone array based on maximum likelihood estimation", *Signal Processing* 107, [doi:10.1016/j.sigpro.2014.09.015](https://doi.org/10.1016/j.sigpro.2014.09.015). Maximum-likelihood SRO from long recordings.
- Bahari, Bertrand and Moonen (2017), "Blind sampling rate offset estimation for wireless acoustic sensor networks through weighted least-squares coherence drift estimation", *IEEE/ACM TASLP* 25(3), [doi:10.1109/TASLP.2016.2647713](https://doi.org/10.1109/TASLP.2016.2647713). Coherence-drift SRO; long windows, simulated or lab data.
- Gburrek, Schmalenstroeer and Haeb-Umbach (2022), "On synchronization of wireless acoustic sensor networks in the presence of time-varying sampling rate offsets and speaker changes", ICASSP, [doi:10.1109/ICASSP43922.2022.9746284](https://doi.org/10.1109/ICASSP43922.2022.9746284). Online SRO and time-offset tracking when talkers move; the strongest current baseline for the tracking part.
- Schmalenstroeer, Gburrek and Haeb-Umbach (2023), "LibriWASN: a data set for meeting separation, diarization, and recognition with asynchronous recording devices", ITG Speech Communication, [arXiv:2308.10682](https://arxiv.org/abs/2308.10682); data on Zenodo, [doi:10.5281/zenodo.10952434](https://doi.org/10.5281/zenodo.10952434), CC BY 4.0. Five phones and four arrays recording the same loudspeaker playback in a 200 ms and an 800 ms room: the real-device data step 1 runs on.
- Chen et al. (2020), "Continuous speech separation: dataset and analysis" (LibriCSS), ICASSP, [arXiv:2001.11482](https://arxiv.org/abs/2001.11482). The playback design LibriWASN re-records.

*Calibrated abstention.*
- Angelopoulos and Bates (2023), "Conformal prediction: a gentle introduction", *Foundations and Trends in Machine Learning* 16(4), [doi:10.1561/2200000101](https://doi.org/10.1561/2200000101) (preprint [arXiv:2107.07511](https://arxiv.org/abs/2107.07511)). Distribution-free risk control for a threshold chosen on calibration data: the tool for a gate whose failure rate holds when calibration and test are exchangeable, and the thing to test when they are not (another room, another phone).

*Our own prior work.* [`capture-audiosync`](../capture-audiosync) (GCC-PHAT plus a robust line on synthetic audio), [`capture-realaudio`](../capture-realaudio) (gallery clips: real sound, simulated delay, partial whitening), [`capture-reverbsync`](../capture-reverbsync) (simulated rooms: PHAT worst), [`capture-syncgate`](../capture-syncgate) and [`capture-residgate`](../capture-residgate) (PSR gates chosen leave-one-clip-out), [`capture-trackprior`](../capture-trackprior) and [`capture-aliaswin`](../capture-aliaswin) (aliasing on periodic content), [`capture-syncslope`](../capture-syncslope) and [`capture-syncfilter`](../capture-syncfilter) (clock models with assumed 40 ppm drift), [`capture-syncedit`](../capture-syncedit) and [`capture-realedit`](../capture-realedit) (what sync error does to an edit). All used simulated delays, simulated drift or no reverberation; none had two real devices.

## Gap

1. **A real-device benchmark with a checked reference.** Short-window sync scored against a reference that is itself validated without ground truth (triple closure over five devices, agreement of two weightings), on real rooms and real clocks. We found no multi-camera audio-sync paper that reports per-window failure rates against such a reference.
2. **Threshold theory checked on real recordings.** Ianniello's wrong-peak probability, fed with each window's measured spectra, compared with the observed failure rate across window lengths, weightings, rooms and added noise.
3. **A gate whose failure rate transfers.** A PSR (or learned) confidence with a conformal threshold set in one room, device set or dataset, scored in another, and the conditions under which the guarantee breaks.

Narrowly: claim 1 is new as far as the works above go; claims 2 and 3 apply known tools (threshold analysis, conformal risk control) to a setting where they have not been reported together.

## Hypotheses

- **H1 (reverberation).** At a fixed added SNR of 0 dB or below, 2 s windows fail (more than one 30 fps frame off) more often in the 800 ms room than in the 200 ms room. *Refuted* if the 800 ms failure share is at or below the 200 ms one with session-bootstrap intervals that exclude a difference in the predicted direction.
- **H2 (weighting).** On real reverberant recordings with added noise at 0 dB or below, partial whitening (gamma 0.25 to 0.5) fails less than PHAT, as on dry gallery clips and against `capture-reverbsync`'s simulated rooms. *Refuted* if PHAT's failure share is lower or the intervals overlap in both rooms.
- **H3 (transfer).** A PSR threshold chosen in one room so accepted windows fail at most 1% keeps them at most 2% in the other room while keeping at least half the windows. *Refuted* if the failure among accepted windows exceeds 2% in either direction.
- **H4 (theory).** Ianniello's threshold model with per-window measured spectra predicts the observed failure share within a factor of two over the grid of window lengths and SNRs. *Refuted* outside that factor in more than a quarter of cells.
- **H5 (system).** Coarse offset, windowed tracking and a gated line fit keep a whole 10-minute session within one frame for at least 99% of its duration at 0 dB added noise. *Refuted* below 99%.

## Method

- **Data.** LibriWASN (Zenodo, CC BY 4.0): five smartphones (Nexus, Pixel 6a, Pixel 6 x2, Pixel 7, Xiaomi), 16 kHz, recording loudspeaker playback of LibriSpeech in a 200 ms and an 800 ms room, ten 10-minute sessions per overlap subset; fetched by HTTP range requests (only the phone channels, about 1 GB for two subsets), never copied into the repository. Later: the overlap subsets (two talkers at once), the time-varying-SRO set of Gburrek et al. (Zenodo 15111025), and owner-recorded camera pairs with wind and crowds (owner step).
- **Reference.** For each pair, 20 s GCC windows every 10 s and a Theil-Sen line; accepted when most windows sit within 5 ms of it, checked by triple closure and by a second weighting. Its error bound (closure, a few ms) is far under the frame criterion.
- **Theory.** Ianniello's (1982) probability of a gross error, evaluated with each window's estimated auto- and cross-spectra; where speech's non-stationarity breaks it, say how.
- **Experiments.** One harness (`src/capture_sync/`) over window length, weighting, added noise (white, then recorded babble and wind), room and device pair; gates (PSR, conformal, learned) trained in one condition and scored in another; the end-to-end session tracker.

## Evaluation

- **Baselines.** GCC-PHAT (Knapp and Carter 1976), plain correlation, the fingerprint-and-consistency approach of Kammerl et al. (2014) reimplemented, and the online SRO tracker of Gburrek et al. (2022) through its open code (`paderwasn`), on the same windows.
- **Metrics.** Share of windows more than one frame (33.3 ms) off; error size where found; AUROC of the confidence; coverage and failure among accepted windows of a gate; share of a session out of sync for the full tracker.
- **Seeds and intervals.** 40 random window times per pair and session (seeded); 95% intervals by resampling sessions (the unit that is independent); paired comparisons on the same windows.
- **Ablations.** Window length (0.5 to 4 s), weighting exponent, band, prior range, room, device pair, overlap subset.
- **Protocol.** Thresholds are chosen in one condition and scored in another; any look at a test condition before a design change is logged in `LOG.md`.

## Milestones

1. **Real-device benchmark** (this PR, 2026-11-13): reference lines with closure checks, measured clock-rate offsets of the five phones, short-window failure shares by room, window, weighting and added noise, PSR AUROC and a room-to-room gate transfer (H1, H2, H3 first look).
2. **Threshold theory** against the step 1 grid (H4).
3. **Conformal gate** across rooms, devices and overlap subsets, and where exchangeability fails.
4. **Baselines on equal windows**: Kammerl et al. reimplemented, `paderwasn`'s online tracker.
5. **Real noise**: recorded babble and wind (licensed recordings, or owner clips), outdoors.
6. **Session tracker end to end** and its out-of-sync share (H5); feed `capture-realedit` with it.
7. **Cameras**: owner-recorded multi-camera clips with genlock or a clapper reference for ground truth.
8. **Paper** in the venue's format; submission is an owner step.

## Target venue

*IEEE Signal Processing Letters* (four pages plus references) for the benchmark and the transfer result, or ICASSP (four pages plus one of references); the field journal *IEEE/ACM Transactions on Audio, Speech, and Language Processing* for the full study with theory. An aim, not a claim of acceptance.

## Deep-tech application

The system is a multi-camera capture rig without genlock: a travel creator's box of cameras (track 13), a robot's multi-camera head, a volumetric-capture rig built from phones, or a wireless acoustic sensor network. The number it moves is the share of a session out of sync by a frame or more, and the abstention rate at a stated failure rate. A rig builder or a WASN engineer would act on it by picking the window, weighting and gate threshold. Trying it on the real thing needs two or more owned cameras with a clapper or timecode reference (owner step), and nothing else that costs money.

## Guardrails

- Recordings are fetched at run time from their licensed source and never committed; LibriWASN is credited under CC BY 4.0.
- Owner clips of people follow track 13's privacy rules (blur bystanders; discreet is not covert).
- Results come from the code; the reference's own error is reported, not assumed away.
