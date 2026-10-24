# chip-abc-orderpass: which Yosys pass makes operand order matter? (`opt_merge`: it shares `a+b` between two adders only when both are written with `a` and `b` first; stylised, one adder, Yosys 0.33)

Track 3 (LLM chip-design loops, `PROJECTS.md`). `chip-abc-order` found that reordering the operands of `a + b + const` changes a carry-select adder's synthesised size by up to 1.43x, and guessed the cause (`alumacc`/`macc` operand grouping). This project tests that guess. It runs the synthesis flow one pass at a time to find where the netlists first diverge, enumerates every operand order of the adder's chains instead of sampling 12, and removes the suspected pass to see whether the dependence goes away. Chosen over another seed or design variant because the previous project left exactly these three steps open. Produced with AI assistance (Claude). Preliminary and small: one adder, one tool version, a generic-gate library.

**Live page:** https://duncan-haywood.github.io/monorepo-projects/research/chip-abc-orderpass/

**Builds on.** `chip-abc-order` and `chip-abc-sweep` (same author, MIT): the `csel4` generator, the miter equivalence check, the ABC scripts and the `add16` reference are copied from them (the `resyn2` sequence is resyn2-style, written from memory there). Yosys and its integrated ABC (Brayton and Mishchenko, CAV 2010, LNCS 6174:24-40, <https://doi.org/10.1007/978-3-642-14295-6_5>, as cited in `chip-abc-sweep`; not re-read here). No connection to the CU Boulder groups in `prompt.md` is claimed.

## Method
- `csel4` is a 16-bit adder of four 4-bit blocks. Its const-0 chains (`r0`, `x1..x3`) and const-1 chains (`y1..y3`) are each `a[i] + b[i] + 5'dc`. `orders.csel4(order0, order1)` writes every const-0 chain in one of the 3! = 6 operand orders and every const-1 chain in one of 6: **36 variants, all of them**. All 36 are proved equivalent to `add16.v` with a Yosys miter and `sat -prove` (0 failures).
- **Localise.** `trace.py` runs the 20 passes of `synth -flatten -noabc` (`coarse` and `fine` steps of `help synth`, Yosys 0.33) one at a time and records `stat -width` cell counts after each. The first pass whose counts differ from the as-generated text is the candidate. Inside it, the sub-passes of `opt` are run one by one.
- **Score.** Cells x topological depth (`ltp -noff`) after `abc -g` with `yosys_default`, `dch_map` and `resyn2_map`. `explicit.py` writes the same flow out pass by pass; the run asserts it reproduces `synth` exactly for every variant and script.
- **Ablate.** The same flow with every `opt` replaced by `opt_expr; opt_muxtree; opt_reduce; opt_share; opt_clean; opt_expr`, i.e. without the two `opt_merge` calls.

## Reproduce
```bash
sudo apt-get update && sudo apt-get install -y yosys iverilog   # Yosys 0.33 here
cd research/chip-abc-orderpass
python3 -m unittest discover -s tests
python3 experiments/run.py      # rewrites experiments/results.txt (about 2 min)
python3 experiments/figure.py
```

## Results (from `experiments/results.txt`)
- **The first divergence is `opt -nodffe -nosdff`, and inside it `opt_merge -nomux`.** Up to `opt_clean` every variant has the same cells (14 `$add`, 10 after `opt_expr` removes the `+ 0`s). After `opt_merge` the as-generated text has 7 `$add` cells and other orders have 10.
- **The cause is sharing.** In the as-generated text `x = a + b + 0` and `y = a + b + 1` both start with `a + b`, so `opt_merge` keeps one `a + b` and adds the constant afterwards. That is 7 adders instead of 10. It happens in exactly 4 of the 36 variants: const-0 chains starting `a, b` or `b, a` together with const-1 chains starting `a, b` or `b, a` (the data show `a, b` and `b, a` behave alike, so the pair is matched regardless of order). Every other order, 32 of 36, leaves the three `a + b` pairs unshared.
- **So the score takes only two values, not 36**, with the normal flow: sharing 2090 / 1232 / 1665 and not sharing 2268 / 1024 / 1300 (`yosys_default` / `dch_map` / `resyn2_map`). Under `dch_map` and `resyn2_map` the *shared* netlist is the larger one (1.20x and 1.28x), under `yosys_default` the smaller one (0.92x). The sign of the effect depends on the ABC script.
- **Removing `opt_merge` does not remove the dependence; it widens it.** Without it, max/min over the 36 orders is 1.44x (`yosys_default`), 3.17x (`dch_map`) and 2.77x (`resyn2_map`), against 1.09x, 1.20x and 1.28x with it. The unshared orders now differ among themselves (where the constant enters the `$alu` carry chain), so `opt_merge` was hiding variation, not creating it. The earlier `alumacc` guess is not what first separates the netlists: the cell counts already differ one pass earlier, at `opt_merge`. This ablation is a model of the flow, not a patched Yosys.
- The best variant under `dch_map` (1024) is the same 1024 as `chip-abc-order`'s best random permutation, so that project's 17% win over the text `chip-abc-sweep` called best is the effect of *not sharing* `a + b`.

## Limitations
- One adder (`csel4`), one Yosys/ABC version (0.33), generic-gate cells x depth, no place and route. "Order matters via `opt_merge`" is shown for this structure only.
- The variants are uniform (all const-0 chains in one order, all const-1 chains in one). Mixed orders per block (6^7 combinations) were not run; the sharing rule says each block should act independently, but that is inferred, not tested.
- The cause of the *sign* (why a shared `a + b` leaves ABC a worse netlist under `dch_map` and `resyn2_map`) is not investigated.
- Counts after each pass are used to find the first divergence; two netlists with equal counts but different structure would be missed. Text signatures differ at `proc` already (the operands are written in different orders), so they cannot localise anything.
- No LLM is involved; nothing here benchmarks one.

## Next steps
Run mixed per-block orders to test that blocks act independently; check the same sharing story on `mul6` and on the SKY130 flow of `chip-pnr`; add "write `a + b` first in every chain, or never share" as a free baseline dimension to `chip-ppa-loop`'s proposer comparison; find why sharing hurts under `dch`.

## Outside dependencies
Yosys and Icarus Verilog (apt). No LLM API, OpenROAD or PDK. Generators, flow wrapper and reference design copied from `chip-abc-order` (MIT); the rest is original.
