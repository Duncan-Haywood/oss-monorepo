# chip-macp32cells: is "P = 32 is smaller than P = 16 at equal cycles" a real effect or a Yosys/abc artefact? (artefact-sensitive, stylised)

Follow-up to `chip-systolic-p32` in the LLM chip-design-loop track (`PROJECTS.md`, track 3). That project found the P = 32 MAC engine had fewer generic-gate cells than P = 16 at the same cycle count (5637 against 6043 at F = 16) and wrote that this "small synthesis effect ... was not investigated" and that its 0.7% effect on the best design "is within what a different abc script could change". This project tests that statement. Produced with AI assistance (Claude). Preliminary and small: one network family, three model seeds, one tool version, no LLM in the loop.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-macp32cells/

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection to them is claimed. Code is copied (MIT, same author) from `research/chip-systolic-p32` (`model.py`, `baseline_gen.py`, unchanged); `flow.py` and the sweep are new. Tools: Yosys 0.33.

## Method
- F-16-4 quantised MLP (4-bit), F = 16 and 32; P-lane MAC engine with P = 8, 16, 32, 64. With 16 hidden units, P = 16, 32 and 64 take identical cycles (36 at F = 16, 52 at F = 32), so any cell difference among them is pure synthesis, not a design trade-off.
- Three model seeds (different trained weights, so different ROM contents), three Yosys flows: **A** `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX` (the script every earlier `chip-*` project used); **B** the same with the 4-gate library `AND,OR,XOR,MUX`; **C** the A library with `abc -fast`.
- Report cells, flip-flops and cells minus flip-flops.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog python3-numpy    # Yosys 0.33 here
cd research/chip-macp32cells
PYTHONPATH=src python3 -m unittest discover -s tests    # about 1 min
PYTHONPATH=src python3 experiments/run.py               # about 9 min on 4 cores; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`)
P = 32 minus P = 16, in cells, for seeds 0, 1, 2 (negative = P = 32 smaller):

| F | flow A | flow B | flow C |
|---|---|---|---|
| 16 | -406, -383, -271 | +71, +162, +187 | -571, -584, -561 |
| 32 | -47, -230, -230 | +57, +370, +302 | -691, -699, -674 |

- **The sign depends on the flow, not on the design.** P = 32 is smaller in all 6 cases under A and in all 6 under C, and larger in all 6 under B. Overall 12 of 18 cases favour P = 32, but that count only reflects that two of the three flows use the same nine-gate library.
- **Size of the swing.** Differences between designs that take identical cycles are 47 to 699 cells, 1% to 10% of the engine, in either direction. That is far larger than the 0.7% margin by which `chip-systolic-p32` ranked P = 32 over P = 16 as the best design at F = 32, so that ranking should be discarded.
- **P = 64 versus P = 32** (also identical cycles) differs by -892 to +30 cells, again with the sign set by the flow (under B, P = 64 is 160 to 892 cells smaller than P = 32).
- **Flip-flops are not the cause of the sign.** Flip-flop counts are the same for all three seeds: 364 (P = 16) and 363 (P = 32 and 64) at F = 16 under A; 510 and 445 at F = 32. Lanes beyond the 16 hidden units therefore appear to be mostly pruned as unused, but the combinational logic left over differs by flow. This was not traced to individual cells here.

## Limitations
- Three seeds of one task, one Yosys version, three abc flows; no technology mapping to a real library, no timing, no layout (`chip-pnr` covers that question).
- Generic-gate cell counts are not area. Which flow is "right" was not decided: the finding is that the P = 16 against P = 32 ordering is not a property of the RTL.
- The mechanism (why lanes above 16 are only partly removed, and why 65 flip-flops go at F = 32 only) is unexplained.
- RTL correctness of P = 32 was shown in `chip-systolic-p32`; it was not re-simulated here.

## Next steps
Inspect which cells of the extra lanes survive (a netlist diff of P = 16 and P = 32); rank all `chip-*` conclusions that rest on gaps under about 10% against a second flow before trusting them.

## Owner steps
None needed.

## Outside dependencies
Yosys (apt), NumPy. No LLM API, OpenROAD or PDK. MIT-licensed.
