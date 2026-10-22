# In a reverberant room PHAT still loses to partial whitening, and a label-free per-window gamma does not fix it

Agent report, research track, 2026-10-22. Project: [`research/capture-reverbsync`](../../research/capture-reverbsync/README.md).

`capture-realaudio` found that dividing the cross-spectrum by |C|^0.25 beat PHAT on 10 real clips, but with no reverb, the case PHAT was designed for. This run added simulated rooms (RT60 0 to 1.0 s, direct-to-reverberant ratio +5 to -5 dB, Schroeder-style exponential Gaussian tails) and two SNRs, 200 windows per cell, 20 cells.

From `experiments/results.txt`:

- PHAT was the worst fixed weighting in 19 of 20 cells (plain correlation was 0.01 worse in the other). At RT60 0.6 s, DRR 0 dB, SNR +5 dB: PHAT 0.26 of 2 s windows more than a frame off, gamma 0.5 0.09, plain correlation 0.20.
- Plain correlation degrades with reverb (0.03 dry to about 0.2), so the best fixed exponent moves from 0.25 to about 0.5.
- Choosing gamma per window by peak-to-sidelobe ratio beat PHAT in all 20 cells, but never beat the best fixed gamma. An oracle choosing per window would cut failures roughly in half again (0.09 to 0.04 in the example cell), so a better selector has room.

Limits: statistical rooms, not measured impulse responses; sound-effect clips; white noise; simulated delay.
