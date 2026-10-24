# Hand-labelled sample: where do 40 research projects' inputs come from?

A random 40 of the 761 projects (`random.seed(20261020); random.sample(projects, 40)`),
read by one AI reviewer (a Claude subagent, 2026-10-20). For each one it read the README,
traced the code to any tool or dataset it claims, and checked one headline number against the
committed results file. It changed no files. A second rater was not used, so the labels are one
reader's. The borderline cases are listed at the end. The main session spot-checked two rows
(`society-llmtown`'s 0.458 and `ambient-pipeline`'s "50 to 63 ms") against the files.

Labels:
- **external-data**: the result is computed from a real external dataset or measurement.
- **repo-data**: computed from this repository's own records.
- **real-tool**: a measurement of a real program's behaviour (Yosys, MuJoCo, gcc, a speech model) on inputs the author designed.
- **cited-parameters**: a model whose key parameters are cited from published sources.
- **assumed-parameters**: a model whose key parameters the author chose.
- **math**: a theoretical result checked numerically.

| slug | input basis | headline number checked (README vs results file) | matched | discloses assumptions | fabrication concern |
|---|---|---|---|---|---|
| ambient-asrnoise | assumed-parameters | wake recall 0.151→0.039 vs 0.151 / 0.039 | yes | yes | no |
| ambient-dr | assumed-parameters | dr_biased −40.53 vs −40.53 | yes | yes | no |
| ambient-gatefw | real-tool (gcc struct sizes; audio synthetic) | 1020 B / 120 B, 0.736/0.727 | yes | yes | no |
| ambient-memory | assumed-parameters | hit@5 0.93 vs 0.931 | yes | yes | no |
| ambient-pipeline | real-tool (Silero, Whisper, Qwen, Piper on synthetic speech) | 306 ms, 938 ms | yes (a side claim is off) | yes | no |
| autocorr-twin | math | n·Var 18.82, 19.15 vs 18.820 / 19.146 | yes | yes | no |
| capture-crop | math | 24 mm; 27,192 px | yes | yes | no |
| chip-mcm | real-tool (Yosys 0.33 + ABC) | −19.7% (recomputed from 160 rows) | yes | yes | no |
| collision-elicitation | math | "about a quarter" vs 0.268 | yes | yes | no |
| compute-shirking | math | ≈4.4 audits vs 4.41 | yes | yes | no |
| coupling-twin | math | 6/16/62/270 steps | yes | yes | no |
| energy-home | assumed-parameters | $451/kWh | yes | yes | no |
| energy-mix | assumed-parameters (real ENTSO-E/OPSD 2019 series, assumed costs drive the result) | $177/MWh, 10.6 TWh | yes | yes | no |
| explanation-twin | math | 88/78/60% vs 0.882/0.778/0.602 | yes | yes | no |
| fiat-shamir-grinding | math | 10×–60×; 1.23× | yes | yes | no |
| forgetting-audit | math | 6.7; ~9,600 jobs vs 6.72 / 9644.1 | yes | no | no |
| garment-assistpower | assumed-parameters | 9.00 kg, +1.0% | yes | yes | no |
| garment-thermal | assumed-parameters (PMV core checked against pythermalcomfort) | −7.7 C; −2.4 C | yes | yes | no |
| garment-twonodelag | assumed-parameters | 0.234→0.150 C | yes | yes | no |
| house-costsens | assumed-parameters (NAHB shares cited) | 9.0–19.9 | yes | yes | no |
| house-escalate | cited-parameters (EIA prices; component costs invented) | 4.6%/yr | yes (a side claim is off) | yes | no |
| house-hvacnpc | cited-parameters (EIA prices) | −6,206 | yes | yes | no |
| noisy-referee | math | 0.2500 / 0.178 | yes | yes | no |
| osrobot-pipeline | assumed-parameters | 1.04 / 0.86 | yes | yes | no |
| position-rent | math | 0.368 of 0.407 | yes | yes | no |
| ransac-twin | math (over an assumed beta-binomial) | 14.1%, K=458 | yes | yes | no |
| replicate-twin | math | 0.9212 vs 0.9207; 1.07×, 2.2× | yes | yes | no |
| robofab-cell-fescsweep | math (decomposition vs exact CTMC) | −5.0%, −3.2% | yes | yes | no |
| robofab-motorcurve | assumed-parameters | 3.5%–28.6% | yes | yes | no |
| robofab-slipmu | real-tool (MuJoCo 3.16.0) | 4.5; 32.9/400/242.7/89.4 | yes | yes | no |
| scenario-twin | math | 2,179 vs 83,459 runs | yes | yes | no |
| selfrep-repairlabour | assumed-parameters | 414 vs 458 | yes | yes | no |
| simdesign-robustmove | real-tool (the repo's own FEM optimiser) | 5 of 9; 741.9 | yes | yes | no |
| society-converts | assumed-parameters | median round 721 | yes | yes | no |
| society-llmtown | assumed-parameters (hand-written stub, no LLM run) | 0.799 / 0.601 | yes (a side claim is off) | yes | no |
| swe-audit | repo-data | 36/40 = 90% | yes | n.a. | no |
| swe-nullrate | repo-data | 23/39 = 59% | yes | n.a. | no |
| topk-routing | math | 8–14× lower variance | yes (a side claim is off) | no | no |
| twin-transfer | math | 0.21 vs 0.2138 | yes | yes | no |
| workcell-twin | math | 1.86×, 3.03× | yes | yes | no |

## Tally

| input basis | projects |
|---|---|
| math | 17 |
| assumed-parameters | 14 |
| real-tool | 5 |
| repo-data | 2 |
| cited-parameters | 2 |
| external-data | 0 |

- **Headline numbers matched the committed file: 40 of 40.** Fabrication concern: 0 of 40.
- **Assumptions disclosed** in every project that has assumed or cited parameters, nearly always in the opening paragraph. Two analytic projects (`forgetting-audit`, `topk-routing`) never say "stylised" in the README.
- **Four secondary claims are a little off.** In each case the prose summarises the results file loosely, and the headline number itself matches:
  - `ambient-pipeline` says "50 to 63 ms later"; the results show 46–75 ms.
  - `house-escalate` says "about one point" at every price; the change is +0.7 at X=$4,000.
  - `topk-routing` says the bound held "at 41–58% of the bound"; one run is at 0.10 and another near 2%.
  - `society-llmtown` says "stays under 0.5 except at … (0.458 mean)", and 0.458 is itself under 0.5.
- `simdesign-robustmove` quotes two exploratory interactive runs that are in no committed file. It labels them as such.
- **Borderline labels:**
  - `energy-mix` could be external-data.
  - `house-costsens` could be cited-parameters.
  - `capture-crop`, `ransac-twin` and `robofab-cell-fescsweep` could be assumed-parameters rather than math.
