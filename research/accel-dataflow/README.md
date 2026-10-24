# accel-dataflow: which dataflow should a small keyword-spotting accelerator use, and where does a loop-nest cost model stop being trustworthy? (stylised)

Third milestone of track 8 (task-specific AI accelerators) in `PROJECTS.md`. The question: for the two matrix-vector layers of the 40 trained `accel-kws` keyword-spotting MLPs, how much does the choice of dataflow (what stays put in the MAC array) change SRAM traffic, energy and cycles, as the lane count and batch grow? Produced with AI assistance (Claude).

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/accel-dataflow/

**Builds on.** `research/accel-kws` (its 40 models, layer shapes, measured RTL cycles and modelled energy) and `research/accel-codesign` (lane-count knob). The vocabulary of weight-, output- and input-stationary dataflows and the idea of ranking them by memory accesses follow Chen, Emer and Sze (2016), "Eyeriss: A Spatial Architecture for Energy-Efficient Dataflow for Convolutional Neural Networks", ISCA, and Sze et al. (2017), "Efficient Processing of Deep Neural Networks: A Tutorial and Survey", *Proc. IEEE*. Loop-nest cost models of this kind are what Parashar et al. (2019), "Timeloop", ISPASS, formalise; **Timeloop and Accelergy were not tried here**, so the model is a small one written for this project and nothing is compared with their output. Energy constants are those of `accel-kws`, in the spirit of Horowitz (2014), ISSCC, and were not re-checked against that paper. No paper's numbers are reproduced. This project builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- **Layer.** `y[b][o] = sum_i W[o][i] x[b][i]` with O outputs, I inputs, batch B, on a 1-D array of P MAC lanes. Each `accel-kws` model has two layers: (hidden x inputs) and (11 x hidden).
- **Dataflows** as schedules (loop order outer to inner; lane mapping), in `src/accel_dataflow/flows.py`:
  - **OS** output-stationary: `(o_tile, b, i)`, lane = output; partial sums stay in lane registers, weights are re-read for every batch element.
  - **WS** weight-stationary: `(o_tile, i, b)`, lane = output; a weight is held across the batch, but partial sums leave the registers when B > 1.
  - **IS** input-stationary: `(i_tile, o, b)`, lane = input, adder tree across lanes; partial sums accumulate in SRAM across input tiles.
  - **RT** reduction-tree: `(o, i_tile, b)`, lane = input; one output finishes before the next starts.
- **Simulator.** `simulate()` walks the schedule cycle by cycle, computes the actual products, and counts SRAM reads of weights, activations and partial sums with a one-cycle register: an operand is fetched only if it differs from what the lane (or the broadcast bus) held in the previous cycle. **Closed forms** (`closed_form()`) give the same counts from loop bounds; the tests require exact agreement on ~1,200 random (dataflow, O, I, B, P) cases, and that the arithmetic equals NumPy.
- **Energy.** MAC energy plus SRAM bits read or written, with `accel-kws`'s assumed constants (0.16 pJ/bit SRAM, 24-bit partial sums). Registers, control, leakage and the adder-tree wiring are not charged, identically for all dataflows.

## Reproduce
```bash
cd research/accel-dataflow
python3 -m unittest discover -s tests -v   # 4 tests, ~1 s (needs numpy)
python3 experiments/run.py                 # ~1 min; writes experiments/results.json and results.txt
python3 experiments/figure.py              # needs matplotlib; writes experiments/dataflow.png
```

## Results (from `experiments/results.txt`; assumed energy constants, 40 `accel-kws` models)
- **Fidelity check at P = 1.** The schedule model's cycles equal the measured RTL cycles of `accel-kws` minus its 3-cycle overhead for all 40 models (max difference 0), and its OS energy equals `accel-kws`'s modelled energy plus one 24-bit partial-sum write per output (max difference 8e-15 nJ). This checks only the P = 1 end that the earlier RTL covers. **No RTL was written or simulated for P > 1 or for the other dataflows**, so the cycle counts there are the model's own.
- **Batch 1 (a real-time keyword spotter):** OS and WS are identical in energy (the same schedule when B = 1). IS costs a median 4.1x, 3.2x, 2.5x, 1.8x, 1.4x and 1.2x the best at P = 1, 2, 4, 8, 16, 32, because its partial sums go through SRAM. RT matches OS only at P = 1; for P > 1 the model gives it no activation buffer, so it re-reads the vector for every output (a median 1.45x to 2.34x the best for P = 2 to 32; 4.95 nJ OS against 11.15 nJ RT at P = 16 for the 7-segment/64-hidden/4-bit model).
- **Batch 4:** OS wins in all 40 models at every P in the base model. WS is a median 4.5x (P = 1) rising to 9.0x (P = 32) worse (a partial-sum round trip per MAC); IS and RT are a median 4.5x (P = 1) falling to 2.1x (P = 32) worse. Spread between best and worst dataflow over the 40 models: median 2.1x to 4.1x at B = 1, 4.5x to 9.0x at B = 4 (maximum 15x, at B = 4 and P = 32).
- **Cycles barely depend on the dataflow** (median 272 against 278 at P = 16, B = 1); what differs is lane utilisation at the tails. The 11-output layer uses 11 of 16 lanes under OS, which the input-mapped flows avoid, but they pay for it in SRAM traffic.
- **A sensitivity that changes the ranking.** If an input buffer holds the whole activation vector (every activation read from SRAM once, buffer area not charged), RT becomes equal to OS at B = 1, and at B = 4 the winner flips with P: OS wins all 40 models at P = 1, 30 at P = 8, 20 at P = 16 (tied with IS and RT, which are 1.02x of each other), and none at P = 32, where IS and RT are 1.37x better than OS because OS keeps only 11 of 32 lanes busy on the 11-output layer. So the headline "OS wins" depends on a buffer the base model does not give the other flows.
- Halving the partial-sum SRAM energy (0.25x) leaves OS the winner everywhere at B = 4 in the base model.

## Limitations
- Stylised. The array is 1-D, layers are plain matrix-vector products, and the batch is a software knob, not a streaming-window overlap in the real application.
- The energy ranking is set by the assumed constants and by which operands may be buffered. The one-cycle register is crude: it favours OS, whose reuse is adjacent in time. Real designs add register files and double buffers whose area and energy are not modelled; the sensitivity above shows this can change the winner. Rankings within about 5% should not be read.
- Cycle agreement with RTL is established only at P = 1 and OS; every other cycle count is unchecked against hardware. No Timeloop or Accelergy comparison was made.
- Inherited from `accel-kws`: weak features, one hidden layer, assumed 45 nm-style energy constants not re-checked, no leakage, dataset mirror from a third party.

## Next steps
Write a P-lane OS and RT engine in RTL and compare cycles at P > 1; add a bounded input buffer with an area cost, and find the buffer size at which the winner flips; try Timeloop and Accelergy if they install; then `accel-policy`.

## Owner steps
None. Simulation only; no hardware was specified, bought or measured.

## Outside dependencies (vitamins)
The trained models and measured RTL cycles of `accel-kws`; its assumed energy constants. Python standard library, NumPy for the tests and matplotlib for the figure.
