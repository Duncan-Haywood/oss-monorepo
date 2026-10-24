# accel-kws: what does a keyword-spotting accelerator cost in cycles, area, energy and bits? (stylised sweep)

First milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`. A small quantised MLP is trained on Speech Commands v0.02 MFCC features, mapped to a serial-MAC RTL engine that is checked **bit for bit** against an integer NumPy reference, and swept over hidden width, weight bits and input size. Each point reports accuracy, cycles, Yosys generic-gate area, modelled energy per inference and an always-on power estimate. Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-kws/

**Builds on.** The task and dataset: Warden (2018), "Speech Commands: A Dataset for Limited-Vocabulary Speech Recognition", arXiv:1804.03209. The task framing (keyword spotting on small devices): Zhang, Suda, Lai and Chandra (2017), "Hello Edge: Keyword Spotting on Microcontrollers", arXiv:1711.07128. The integer-only inference idea (quantised weights and activations, integer accumulate, shift to requantise): Jacob et al. (2018), "Quantization and Training of Neural Networks for Efficient Integer-Arithmetic-Only Inference", CVPR 2018, arXiv:1712.05877; the scheme here is a much simpler power-of-two version written for this project, not a reproduction. Energy-per-operation figures are in the spirit of Horowitz (2014), "Computing's energy problem (and what we can do about it)", ISSCC (see Limitations: not re-checked). Nothing is reproduced from these papers and no number here is comparable with theirs (different classes, features and models). This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them. It follows `chip-accel` and the `chip-systolic-*` projects (same flow idea, toy data) in this repository.

## Method
- **Data.** Speech Commands v0.02 (CC BY 4.0 per the mirror's dataset card; I did not check this against the original release page). The shards come from a third-party Hugging Face mirror, `pollen-robotics/speech-commands-v0.02`, because `download.tensorflow.org` was not reachable from the container; I did not verify the mirror against the original archive's checksum. It carries train/validation/test splits; the three splits share **0 speakers** (checked in `experiments/data_summary.json`).
- **Task.** 11 classes: the ten keywords (yes, no, up, down, left, right, on, off, stop, go) plus "unknown", a deterministic hash-based subsample of the other words sized to about the median keyword class (5.7 to 5.9% of them). No silence class and no background-noise clips. Sizes: 33,895 train, 4,084 validation, 4,509 test clips.
- **Features** (`src/accel_kws/mfcc.py`, written here): pre-emphasis, 30 ms Hamming frames at a 20 ms hop (49 frames per 1 s clip), 40 mel filters, log, DCT, 10 coefficients, then averaged into 7 or 12 equal time segments: 70 or 120 inputs. The front end is **not** in the RTL.
- **Model** (`src/accel_kws/model.py`): one hidden layer, ReLU, 11 outputs. Quantisation-aware training with straight-through gradients in NumPy (Adam, 40 epochs, 3 seeds). Weights are signed integers of 2, 3, 4 or 8 bits with power-of-two scales; inputs int8; hidden activations 8-bit unsigned; 24-bit accumulators; right shift to requantise. All accuracies below come from the **integer reference**, not the float forward pass.
- **RTL** (`rtl/kws_engine.v`): one multiply-accumulate per cycle, address counters, weights, biases and inputs read from external memories, the hidden activations in a register file inside the engine, argmax over the logits. Cycles per inference are MACs + 3.
- **Checks.** For every one of the 40 configurations the seed-0 model's RTL is simulated in Icarus Verilog on 200 evenly spaced test clips (covering all 11 true classes) and its 11 logits and class are compared with the integer reference: 40 of 40 identical. The 13 unit tests also check saturating extreme inputs and the accumulator range (the reference asserts no overflow).
- **Area.** Yosys `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX` cell count of the engine core, generic gates, no technology library. **Memories are not included**: the weight storage is reported separately in kbit, and the hidden-activation register file (8 flops per hidden unit) is included as flops.
- **Energy** (`src/accel_kws/cost.py`): per MAC, an assumed 8x8 multiply (0.2 pJ, scaled with weight bits), 32-bit add (0.1 pJ, scaled to 24 bits) and 0.16 pJ per bit read from an on-chip array, for the weight and the 8-bit activation. These are assumed 45 nm orders of magnitude. The tables give a factor-of-3-either-way range.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog                 # Yosys 0.33, Icarus 12.0 (Ubuntu 24.04)
pip install numpy scipy pyarrow
cd research/accel-kws
sh experiments/download.sh /tmp/sc                     # about 3.3 GB
python3 experiments/prepare_features.py /tmp/sc /tmp/feats.npz      # about 2 min
python3 experiments/run.py /tmp/feats.npz              # about 12 min; writes results.json and results.txt
python3 -m unittest discover -s tests -v               # 13 tests, about 4 s, no dataset needed
```

## Results (from `experiments/results.txt`; test accuracy is the mean of 3 seeds)
Weight bits 4 and hidden width are the main levers. Selected rows (7 segments = 70 inputs unless noted; cycles are MACs + 3; the energy is modelled):

| hidden | weight bits | test acc. | cycles | cells (flops) | weight storage (kbit) | energy (nJ) | always-on at 4 inf/s (&micro;W) |
|---|---|---|---|---|---|---|---|
| 16 | 4 | 0.585 | 1,299 | 1,481 (252) | 5.8 | 2.7 | 0.011 |
| 32 | 4 | 0.685 | 2,595 | 1,822 (384) | 11.4 | 5.4 | 0.022 |
| 64 | 3 | 0.706 | 5,187 | 2,260 (644) | 17.4 | 9.9 | 0.040 |
| 64 | 4 | 0.722 | 5,187 | 2,414 (644) | 22.5 | 10.9 | 0.043 |
| 64 | 8 | 0.725 | 5,187 | 2,885 (644) | 43.3 | 14.7 | 0.059 |
| 128 | 4 | 0.749 | 10,371 | 3,474 (1,160) | 44.8 | 21.7 | 0.087 |
| 128 (12 seg.) | 4 | 0.752 | 16,771 | 3,471 (1,160) | 70.4 | 35.1 | 0.141 |

- **Accuracy saturates near 75%** for this feature set and model. The best configuration (12 segments, 128 hidden, 4-bit) reaches 0.752 on test (validation 0.775); 3 and 8 bits are within 0.4 points of it at that width (0.749 and 0.750).
- **4 bits is enough; 8 bits buys almost nothing.** At 64 hidden units 8 bits improves test accuracy over 4 bits by 0.3 points (0.725 vs 0.722), at 1.9x the weight storage, 1.3x the energy and 20% more cells. At 128 units it is no better (0.748 vs 0.749).
- **2 bits collapses at small width** (test 0.361 at 32 hidden units against 0.685 at 4 bits) and recovers at 128 (0.680, still 6.9 points below 4 bits). This partly reflects my simple clipping rule and 40 epochs, so it is a statement about this training recipe, not about 2-bit weights in general.
- **The cheap point near the top:** 64 hidden units, 4 bits (test 0.722) is within 3 points of the best (0.752) at 31% of its energy and 32% of its weight storage (the best uses 12 segments).
- **Area follows hidden width and weight bits, not input size.** The hidden register file dominates the flops (`8 x hidden`); the 7- and 12-segment engines synthesise to nearly the same cell count. Cycles are set by the MAC count: a single MAC at 20.7 kHz sustains 4 inferences per second for the 64-hidden, 4-bit model.
- **Always-on power versus the wearable budget.** `ambient-wearable` in this repository puts an always-on microphone at 0.6 mA, which at its 3 V reference is 1,800 &micro;W. The modelled classifier compute is 0.0045 to 0.19 &micro;W at 4 inferences per second, four to five orders of magnitude lower. Under these assumptions the microphone and the MFCC front end, not the MAC array, would set the budget; neither the front end, nor leakage, clocking, memory periphery nor the microphone interface is modelled here.
- **Noise.** With 4,509 test clips the binomial standard error at 0.75 is about 0.65 points, and the seed standard deviation is 0.0 to 2.5 points for 3-, 4- and 8-bit rows (mostly under 1) (up to 6.6 for 2-bit), so differences under about 1.5 points between neighbouring rows are not resolved.

## Limitations
- **Estimates, not measurements.** Energy is an assumed 45 nm per-operation model. The Horowitz-style constants in `cost.py` were typed from memory of that table and **not re-checked against the paper** in this run. Area is generic gates with no library, so there are no square microns, nanoseconds or watts from any process.
- **Not comparable with published accelerators or results** (different classes, features, bit widths and node), and nothing here is a claim about a real device.
- A weak model and feature set: pooled MFCC averages discard temporal detail, there is no silence class, no noise or time-shift augmentation, no depthwise-separable CNN, and no hyperparameter search beyond the sweep. The accuracy ceiling is the model's, not the task's.
- One architecture (serial MAC), so cycles are simply the MAC count; dataflow and parallelism are for `accel-dataflow`, joint search for `accel-codesign`.
- The RTL check covers 200 clips per configuration for the seed-0 model only, and the hidden activations sit in flops instead of an SRAM macro.
- A third-party dataset mirror was used and not verified against the original archive.

## Next steps
`accel-codesign` (search model and hardware together against a sequential baseline at equal budget), `accel-dataflow`, and a depthwise-separable CNN to lift the accuracy ceiling. An FPGA flow (`accel-fpga`) would give LUTs and clock.

## Owner steps
None required for this simulation-only milestone. No hardware was specified, bought or measured, so there is no bill of materials.

## Outside dependencies
The MFCC front end (NumPy only, not synthesised); the weight and bias memories (modelled as external arrays, no SRAM macro or ROM synthesised); a standard-cell library and place and route (not used); the Speech Commands recordings (a third-party mirror); the energy constants (assumed). Open tools only: Yosys, Icarus Verilog, NumPy, SciPy, PyArrow.

**Figure.** `python experiments/figure.py` (needs matplotlib) redraws `experiments/pareto.png`, accuracy against modelled energy for all 40 configurations, from the committed `experiments/results.txt` only; it runs nothing new.
