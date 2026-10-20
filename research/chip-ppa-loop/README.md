# chip-ppa-loop: equivalence-gated PPA rewrites of small arithmetic RTL, against a parameter sweep

Third milestone of the LLM chip-design-loop track (`PROJECTS.md`, track 3). A proposer rewrites a working adder and multiplier; each rewrite must be *proved* equivalent to the reference with Yosys before its area and depth count; a parameter sweep with no model gets the same evaluation budget. Produced with AI assistance (Claude). Preliminary and small: two designs, one tool version, one synthesis script.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-ppa-loop/

**Builds on.** The generate-check-score loop idea of VerilogEval (Liu et al., ICCAD 2023, <https://doi.org/10.1109/ICCAD57390.2023.10323812>), RTLLM (Lu et al., ASP-DAC 2024, <https://doi.org/10.1109/ASP-DAC58780.2024.10473904>) and Chip-Chat (Blocklove et al., MLCAD 2023). **Not a reproduction of any of them**; no published benchmark data is used. The adder topologies are textbook: carry-select (Bedrij, "Carry-select adder", IRE Trans. Electronic Computers EC-11(3):340-346, 1962), Kogge-Stone (Kogge and Stone, "A parallel algorithm for the efficient solution of a general class of recurrence equations", IEEE Trans. Computers C-22(8), 1973; sources disagree on the end page, so none is given) and the divide-and-conquer prefix adder called "Sklansky" in the literature, after Sklansky ("Conditional-sum addition logic", IRE Trans. Electronic Computers EC-9(2):226-231, 1960); that paper describes conditional-sum addition and the prefix-tree name is a later convention, so the label here is loose. Titles, venues and years were checked against web search results on 2026-10-13; the papers themselves were not read. It builds on none of the CU Boulder groups in `prompt.md` and claims no connection to them.

## Method
- `designs/add16.v` (`s = a + b`, 16 bits plus carry) and `designs/mul6.v` (`p = a * b`, 6x6 unsigned) are the references.
- `src/chip_ppa_loop/flow.py`: **score** = `synth -flatten; abc -g AND,NAND,OR,NOR,XOR,XNOR,ANDNOT,ORNOT,MUX`, then cell count from `stat` and depth (longest path in cells) from `ltp -noff`. Same generic-gate script as `chip-toolchain`; counts are gate counts, not square microns. **Gate** = a Yosys miter and `sat -verify -prove trigger 0`, which covers all 2^32 (adder) or 2^12 (multiplier) inputs. A rewrite that fails to parse or is not equivalent is rejected and gets no score.
- Figure of merit: cells x depth (an area-delay product proxy). Lower is better. Reference counts as the starting point for both sides.
- **Proposer**: `proposals/<design>/*.v`, written by the Claude session that wrote this project, committed as written. It is not an API call and not a reproducible LLM benchmark. Five adder attempts and four multiplier attempts (the budget). Two attempts were *seeded* non-equivalent on purpose to exercise the gate (`a2_carry_select_bug.v`, `m3_off_by_one.v`); they are not evidence about how often a model errs.
- **Baseline**: `src/chip_ppa_loop/sweep.py` generates Verilog from a few knobs: adder = `+`, ripple, or carry-select with block size 2 to 8 and `+` or ripple blocks (16 configs); multiplier = chain or tree summation x LSB- or MSB-first x mux or AND partial products (8 configs). At the proposer's budget it draws that many configs at random (200 seeds). No model is involved.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog     # Ubuntu 24.04 packages; Yosys 0.33 here
cd research/chip-ppa-loop
python3 -m unittest discover -s tests
python3 experiments/run.py                 # rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`, Yosys 0.33)
| design | reference cells / depth / product | proposer best (5 or 4 attempts) | sweep, exhaustive best | sweep, random draw of the same budget |
|---|---|---|---|---|
| add16 | 82 / 31 / 2542 | 2156 (98 cells, depth 22) = 0.85x | 2156 | mean best 2184; never beat the proposer in 200 seeds, tied in 63 |
| mul6 | 170 / 22 / 3740 | 3740 (nothing beat the reference) | 3850 | 3740 in all 200 seeds |

- add16: the proposer's best (`a3_carry_select.v`, 4-bit carry-select blocks) is the same circuit family as the sweep's `('csel', 4)`, so the tie at the optimum is no surprise and says nothing about any model. The ripple chain has fewer cells (77) than `+` (82) at equal depth 31, as in `chip-toolchain`. Kogge-Stone (88 cells, depth 28) and the Sklansky-style adder (88, depth 29) were not better on cells x depth: ABC restructures the logic, so the written topology does not survive intact. This is a statement about this ABC script, not about those topologies.
- mul6: no rewrite improved on `a * b` by this measure. The carry-save tree is larger (190 cells) and no deeper-faster. All eight sweep configs give identical 175 cells and depth 22, so ABC erased the differences the knobs introduce.
- The gate rejected both seeded faults and accepted every other file; the sweep's 24 configs were all proved equivalent (also asserted by the tests).

## Limitations
- **Nine proposer attempts by the author of the benchmark, two designs.** No statistics about LLMs follow. The sweep draws are over a tiny space (16 and 8 configs) and the comparison is mostly a tie.
- Depth is a topological cell count, not timing; area is a generic-gate count. Neither is post-layout, and neither says anything about a real chip (see the planned `chip-pnr`).
- The reference `a + b` is itself synthesised by Yosys's own adder mapping, so "reference" is not a naive baseline.
- The equivalence proof is only as good as Yosys's miter; ports must match exactly. Combinational designs only.

## Next steps
An `ANTHROPIC_API_KEY`-gated proposer (stubbed in tests) with many samples per design; designs with room to improve (FIFOs, wider multipliers, MACs); a sweep over the ABC script itself; then `chip-accel` and `chip-pnr`.

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. All designs and proposals are original and MIT-licensed.
