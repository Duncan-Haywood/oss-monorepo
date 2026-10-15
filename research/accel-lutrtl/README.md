# accel-lutrtl: what does a product-table engine cost in RTL, against a serial MAC engine? (stylised, synthesis-only, negative)

**Why this was worth doing.** `accel-lut` found the weight-sharing product-table engine did not beat an int8 MAC engine, but only under an *assumed* table-read cost, and it ignored the registers a table engine needs. Its next steps asked for an RTL engine through Yosys. This project writes both engines in Verilog, checks them bit for bit against an integer NumPy reference, and counts what Yosys makes of them. **Result: negative.** The table engine's datapath is 2.4x (N=8) to 11.6x (N=128) the area of the MAC engine, because it must keep one accumulator per output, and it takes 1.1x to 3.0x the cycles. Produced with AI assistance (Claude).

**Builds on.** `research/accel-lut` (the idea and the cost model it questions) and `research/accel-sparse` (the digits MLP, not retrained here). Weight sharing with a codebook is the idea of Han, Mao and Dally (2016), "Deep Compression", ICLR (written from memory, **not re-verified in this run**). No CU Boulder group's work is built on or implied.

## Method
- **Layer.** One dense layer, 64 inputs (unsigned 4-bit) by N outputs, weights drawn from a K-entry int8 codebook. Random codebook, indices and activations (3 seeds): this exercises the datapaths only, **not** accuracy or a trained model.
- **MAC engine** (`rtl/mac_engine.v`): output-stationary, one multiplier, one 20-bit accumulator, an 8-bit weight ROM. N x 64 cycles.
- **Table engine** (`rtl/table_engine.v`): input-stationary. For each input, build K products in a 12-bit table with one multiplier (K cycles), then for each output add the indexed table entry into that output's accumulator (N cycles, no multiplier); then drain N accumulators. 64(K+N)+N cycles. ROMs: a log2(K)-bit index per weight and the codebook. The table is not double-buffered, so build and accumulate do not overlap.
- **Check.** Icarus Verilog output equals `a @ cb[idx]` (exact integers) for every output, 3 seeds per configuration; cycle counts are read from the simulation. A test confirms a wrong reference is rejected.
- **Area.** `yosys synth` then `abc` to generic AND/OR/XOR/MUX gates (Yosys from apt; no technology library), hierarchy kept so ROM logic is separated from the datapath. Gate equivalents (GE) use **assumed** weights (NAND2=1, XOR=2.5, MUX=2.5, flop=5), not a cell library. Yosys turns each ROM into random logic; that figure depends on the random contents and is not a real memory macro.

## Reproduce
```bash
apt-get install -y yosys iverilog; pip install numpy matplotlib
cd research/accel-lutrtl
python3 -m unittest discover -s tests -v     # 4 tests, a few seconds
python3 experiments/run.py                   # about 1 min; writes results.json
python3 experiments/report.py                # writes results.txt
python3 experiments/figure.py                # writes rtl_cost.png
```

## Results (from `experiments/results.txt`)
| N | K | cycles MAC / table | datapath GE MAC / table | flops MAC / table | stored bits MAC / table | MAC+ROM GE | table+ROM GE |
|---|---|---|---|---|---|---|---|
| 8 | 16 | 512 / 1544 | 1934 / 4614 | 91 / 445 | 4096 / 2176 | 3442 | 5510 |
| 32 | 16 | 2048 / 3104 | 1950 / 8280 | 91 / 927 | 16384 / 8320 | 6585 | 11190 |
| 128 | 16 | 8192 / 9344 | 1965 / 22877 | 91 / 2849 | 65536 / 32896 | 17243 | 32106 |
| 32 | 8 | 2048 / 2592 | 1950 / 7546 | 91 / 831 | 16384 / 6208 | 6828 | 9792 |
| 32 | 4 | 2048 / 2336 | 1950 / 7171 | 91 / 783 | 16384 / 4128 | 4634 | 8769 |

(All seven configurations are in `results.txt`.) Both engines were bit exact in all of them. The table halves the stored bits (a 4-bit index against an 8-bit weight at K=16), but to win on area a stored bit would have to cost more than the break-even figure in the last column of `results.txt` (0.4 to 1.4 GE per bit, by configuration). Counting Yosys's own ROM-as-logic area, about 0.4 GE per bit here, the table engine is larger in every configuration. Figure: `experiments/rtl_cost.png`.

## What this says about `accel-lut`
Its energy model charged the table engine a table read and an add per weight. This RTL shows a structural cost that model left out: a table engine that reuses each product across all outputs needs all N accumulators live (flops grow linearly in N), so the area penalty grows with width instead of vanishing. Energy was **not** measured here (no switching-activity run), so this supports "the area and latency side is worse", not a final energy verdict.

## Limitations
- Random weights and activations; no accuracy, no trained model, no Speech Commands task.
- Generic-gate area with assumed GE weights; no placement, routing, timing, or power. Not comparable with any published accelerator.
- ROM logic from random constants is not a memory macro; the break-even column is the honest way to read the storage trade.
- One multiplier and one accumulator per engine; a parallel or double-buffered table engine was not built.
- No clock frequency estimate, so cycles are not seconds.

## Next steps
Toggle-count energy from the simulation; an iCE40 or SKY130 flow for real LUT and clock numbers; a double-buffered table; the same comparison on `accel-kws` features once data is reachable.

## Owner steps
None.

## Outside dependencies
Yosys and Icarus Verilog (apt); NumPy, matplotlib.
