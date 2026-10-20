# chip-sharesign: does letting Yosys share a common `a + b` make adders smaller across ABC scripts? (yes in cells, 55 of 55 runs but one; often deeper; stylised, 11 designs, Yosys 0.33)

Track 3 (LLM chip-design loops, `PROJECTS.md`). `chip-abc-orderpass` found that `opt_merge` shares `a + b` between two chains only for some operand orders, and that in one 16-bit carry-select adder the shared netlist was *larger* under two ABC scripts. This project asks whether that sign flip is typical. It builds 11 small designs whose outputs all contain `a + b` (with constants, with inputs, and with a mux), writes each once so `opt_merge` shares the sum and once so it cannot, and scores both under five ABC scripts. Chosen over another operand-order variant of `csel4` because that chain had reached micro-variants of one adder. Produced with AI assistance (Claude). Preliminary: one tool version, a generic-gate library, no place and route.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-sharesign/

**Builds on.** `chip-abc-orderpass`, `chip-abc-order` and `chip-abc-sweep` (same author, MIT): the flow wrapper (`flow.py`: score, miter equivalence, ABC scripts) is copied from them. Yosys and its integrated ABC (Brayton and Mishchenko, CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>, as cited in `chip-abc-sweep`; not re-read here). No connection to the CU Boulder groups in `prompt.md` is claimed.

## Method
- Families (`src/chip_sharesign/gens.py`), each with k outputs: `addconst` (`y_i = a + b + i`), `addvar` (`y_i = a + b + c_i`, `c_i` an input), `sumthree` (`y_i = s ? a + b + c_i : c_i - a`). Widths 8 and 16, k = 2 or 4 (`sumthree` 16 only k = 2): 11 designs.
- **Shared** writes every output as `a + b + c_i`. **Unshared** writes odd outputs as `c_i + a + b`, i.e. `(c_i + a) + b`, so no two `$add` cells have the same operands. A first version swapped to `b + a` instead and every score was identical: Yosys 0.33 `opt_merge` ignores operand order on commutative cells (a unit test pins this). Every shared/unshared pair is proved equivalent with a Yosys miter and `sat -prove` (11/11 proved).
- Score: cells and topological depth (`ltp -noff`) after `synth -flatten -noabc; abc -g` with five scripts (`yosys_default`, `strash_map`, `dc2_map`, `dch_map`, `resyn2_map`).

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys    # Yosys 0.33 here
cd research/chip-sharesign
python3 -m unittest discover -s tests
python3 experiments/run.py > experiments/results.txt    # about 30 s
python3 experiments/figure.py
```

## Results (from `experiments/results.txt`)
- **Sharing gives fewer cells in 54 of 55 (design, script) pairs**, never more except one: `strash_map` on one design (ratio 1.05). The cells ratio shared/unshared has median 0.76 to 0.85 per script, range 0.60 to 1.05.
- **The sign flip of `chip-abc-orderpass` does not generalise to these designs.** There, sharing was larger under `dch_map` and `resyn2_map` for one carry-select adder whose unshared variants differ in where the constant enters an `$alu`. Here no design shows it under those scripts. What differs is not isolated.
- **Sharing costs depth more often than not**: shared is deeper in 9, 8, 9, 7 and 6 of 11 designs (in the order above). Under cells x depth shared is still smaller in 9, 7, 9, 8, 8 of 11, so the area win mostly outweighs the depth loss, but 2 to 4 designs per script go the other way. Which direction wins therefore depends on the metric.
- Figure: `experiments/sharesign.svg`.

## Limitations
- Generic-gate cells x depth after ABC, not um&sup2; or ns; one Yosys/ABC version (0.33). The depth metric is topological, not timed.
- 11 designs, all adder-shaped. Products (`a * b + c_i`) were dropped: association changes cannot unshare a multiplier, so no clean unshared variant was built.
- Unshared variants are one specific rewrite; other unsharing rewrites may behave differently (`chip-abc-orderpass` found several orders).
- No LLM is involved; nothing here benchmarks one.

## Next steps
Unshare multipliers (for example by duplicating through different widths) to test `mulacc`; repeat on the SKY130 flow of `chip-pnr`; find why `csel4` flips sign when these designs do not; give `chip-ppa-loop` "share common sums" as a free baseline rewrite.

## Outside dependencies
Yosys (apt). No LLM API, OpenROAD or PDK. The flow wrapper is copied from `chip-abc-orderpass` (MIT); the rest is original.
