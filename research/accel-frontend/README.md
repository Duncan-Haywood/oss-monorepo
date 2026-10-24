# accel-frontend: does the MFCC front end cost more than the keyword-spotting network it feeds? (stylised, preliminary)

Track 8 (task-specific AI accelerators) in `PROJECTS.md`, milestone 7 ("accelerators for the rest of track 2's pipeline"). `accel-kws` said that for an always-on wake word "the microphone and the MFCC front end, not the MAC array, would set the budget" and never counted the front end. This project counts it. **Headline:** one 20 ms frame of a 16-bit integer MFCC front end costs 7,532 multiplies, against 5,184 MACs for the whole 70-64-11 classifier per inference; at 50 frames per second against 4 inferences per second, the front end draws about 54 times the classifier's modelled power (7.8 to 146 times over the energy constants I varied). Under the same assumed constants as `accel-kws`; nothing here is a measurement.

**Live page:** https://duncan-haywood.github.io/oss-monorepo/research/accel-frontend/

**Builds on.** `research/accel-kws` (the MFCC recipe in `src/accel_kws/mfcc.py`, the 70-64-11 4-bit classifier and the cost constants in `cost.py`, all imported or mirrored here); `research/ambient-wearable` (the 61 dB-SNR MEMS microphone used for the noise floor). Ideas: Zhang et al. (2017), "Hello Edge", arXiv:1711.07128, on the front end being a real share of keyword-spotting cost; Horowitz (2014), "Computing's energy problem", ISSCC, for energy per operation. No group in `prompt.md` works on this; I do not claim a lab connection.

## Method
- **Front end** (`src/accel_frontend/frontend.py`): Q15 integers, same recipe and dimensions as `accel-kws` (480-sample window, 320 hop, 512-point FFT, 40 mel bands from the exact filterbank, 10 coefficients; the filterbank and DCT are asserted equal to `accel-kws`'s in a test). The 512-point real FFT is a 256-point complex radix-2 DIT FFT plus a real-split pass. The log is a 17-entry table with linear interpolation. Counters sit on every multiply, add, table lookup and 16-bit word moved *in the code that runs*, so the counts are of this implementation, not a formula. The FFT counts are also checked against `4 x 128 x 8` multiplies. Power is kept at 32 bits and the mel step counted as 2 multiplies and 3 adds per weight (32 x 16 into a 48-bit accumulator); a first version that shifted the power right by 15 floored the quiet bins, which the fidelity numbers below would have blamed on the FFT.
- **Energy.** `accel-kws`'s constants, scaled to 16 bits: multiply 0.2 pJ at 8 x 8 scaled by bits squared (0.8 pJ), add 0.1 pJ at 32 bits scaled by bits (0.05 pJ), 0.16 pJ per bit moved (2.56 pJ per 16-bit word). These are the same 45 nm order-of-magnitude values `accel-kws` typed from memory of Horowitz's table; **a web search this run did not surface the table and I did not re-check them**. The sensitivity rows vary multiply energy by one third and memory energy by a third and by 3, and one row counts arithmetic only.
- **Classifier.** 5,184 MACs at `cost.energy_per_mac_pj(4)` = 10.86 nJ per inference, 4 inferences per second (`accel-kws`'s rate), 0.043 uW.
- **Fidelity.** Integer cepstra against a float reference (the `accel-kws` recipe, log2 instead of ln) on 20 synthetic voiced frames per point: harmonics of a random 90 to 250 Hz fundamental under three random formants, plus a fixed -61 dBFS microphone noise floor. The metric is RMS error over coefficients 1 to 9, divided by their spread in the float reference. Three FFT scaling schedules: one right shift per stage (8, outputs X/256), 4 and 2 shifts. Peak intermediate magnitude is recorded to give the word width each schedule would need.

## Reproduce
```bash
pip install numpy matplotlib
cd research/accel-frontend
python3 experiments/run.py        # a few seconds; writes results.json and results.txt
python3 experiments/figure.py     # redraws fidelity.png
python3 -m unittest discover -s tests -v   # 6 tests
```

## Results (from `experiments/results.txt`)
| per 20 ms frame | multiplies | adds | 16-bit words moved | table lookups |
|---|---|---|---|---|
| whole front end | 7,532 | 11,009 | 15,620 | 80 |

Of the multiplies, the FFT is 4,096 and the mel step 494 (247 weights, counted double). The classifier is 5,184 MACs per inference.

| scheme | constants | front end (uW) | classifier (uW) | ratio |
|---|---|---|---|---|
| streaming, 50 frames/s | assumed | 2.34 | 0.043 | 53.8 |
| streaming | arithmetic only | 0.34 | 0.043 | 7.8 |
| streaming | multiply x1/3 | 2.14 | 0.043 | 49.2 |
| streaming | memory x3 | 6.34 | 0.043 | 145.9 |
| streaming | memory x1/3 | 1.01 | 0.043 | 23.1 |
| recompute 49 frames per inference | assumed | 9.17 | 0.043 | 211.0 |

- **The front end dominates, and the conclusion survives every constant I varied.** Even counting only arithmetic, it is 7.8 times the classifier. Memory traffic (an unoptimised FFT reads and writes every point each stage) is most of the modelled energy: 46.8 nJ per frame of which 6.8 nJ is arithmetic.
- **Cache frames.** Recomputing the 49 frames of each 1 s window for every inference makes the front end 4 times worse than computing each frame once.
- **Both are tiny against the microphone.** At the assumed constants the front end is about 2.3 uW; `ambient-wearable`'s 0.6 mA microphone at 3 V is 1,800 uW. So the sharper reading of `accel-kws`'s remark is: the microphone sets the budget, the front end is 50 times the classifier, and neither compute figure includes leakage, clocking or the MCU.
- **Decimating to shrink the FFT does not pay by itself.** Halving the sample rate and using a 256-point FFT saves 115,200 multiplies per second; a decimation filter must cost under 14.4 MACs per output sample (8,000 per second) to break even. A 31-tap filter is over twice that. (Op-count argument only; I did not build the decimated path.)
- **16-bit scaling is the real design choice** (figure `experiments/fidelity.png`). Cepstral error as a share of cepstral spread:

| FFT shifts | -50 dBFS | -30 dBFS | -10 dBFS | peak word at -10 dBFS |
|---|---|---|---|---|
| 8 (one per stage) | 0.68 | 0.38 | 0.12 | 16 bits |
| 4 | 0.41 | 0.16 | 0.02 | 17 bits |
| 2 | 0.21 | 0.06 | 0.00 | 19 bits |

  The one-shift-per-stage schedule fits 16 bits but floors the quiet mel bands (a smooth bias of 1 to 2 cepstral units on a noisy tone); schedules that keep more bits overflow a 16-bit word on loud input. Block floating point or a 24-bit FFT would be the way out; I did not test either, nor 8-bit.

## Limitations
- **Estimates, not measurements, and unchecked constants.** Energy is the `accel-kws` 45 nm model (constants typed from memory, not re-checked); arithmetic and word moves only, no leakage, clock tree, ADC, microphone or control. The memory model charges every operand access to an SRAM, so a register-blocked FFT would move less (the arithmetic-only row bounds that).
- **Synthetic audio.** Speech Commands is unreachable from the container, so the fidelity numbers are on synthetic voiced frames with an assumed -61 dBFS noise floor (from a retailer-page SNR figure in `ambient-wearable`). They show how scaling distorts cepstra, not what it does to keyword accuracy: that needs retraining the classifier on integer features, which is open.
- The "spread" yardstick is the float cepstra's own variation across coefficients of one synthetic frame family, a proxy for how much a classifier could use, not a threshold.
- One front-end design (radix-2, no real-input optimisations beyond the split pass, no trivial-twiddle skipping, which would save a few percent of the FFT).
- No RTL: this counts operations in software. An RTL front end checked against this integer reference is the next step.

## Next steps
Retrain the `accel-kws` classifier on integer features from this front end (on a host that can reach Speech Commands) and measure accuracy against FFT shift schedule; try block floating point; write the front end in RTL and synthesise it beside the classifier engine; re-check the Horowitz table against the paper.

## Owner steps
None. Simulation only; no hardware was specified, bought or measured, so there is no bill of materials.

## Outside dependencies
`accel-kws` (mel filterbank, DCT, cost constants, classifier size) and `ambient-wearable` (microphone figure). NumPy and matplotlib. No dataset, standard-cell library or RTL tool.
