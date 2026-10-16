# chip-p32passes: which Yosys pass flips the P = 32 versus P = 16 cell gap? (localised to the first opt after techmap; also corrects `chip-p32netlist`'s "pre-abc" label; stylised)

Follow-up to `chip-p32netlist` (track 3, `PROJECTS.md`), whose next step was "run `synth` one pass at a time between `coarse` and `fine` to name the pass". Doing that showed that project's middle stage was mislabelled (below), so this one also fixes the stage map. Produced with AI assistance (Claude). Preliminary and small: F = 16, three model seeds, Yosys 0.33, generic cell counts, no LLM in the loop.

**Builds on.** Nothing from the CU Boulder groups in `prompt.md`; no connection is claimed. `model.py` and `baseline_gen.py` are copied unchanged (MIT, same author) from `research/chip-p32netlist`; `flow.py` and `experiments/run.py` are new.

## Method
Generate the F-16-4 MAC engine for P = 16 and 32 (identical cycle counts, since the 16 hidden units leave lanes 16 to 31 idle), then run `synth -flatten -run :fine` and, in the same Yosys session, the passes of synth's `fine` section by hand (`opt -fast -full; memory_map; opt -full; techmap; opt -fast; abc -fast; opt -fast`, as printed by `help synth`), printing `stat` after each.

## Reproduce
```bash
sudo apt-get install -y yosys iverilog python3-numpy    # Yosys 0.33 here; use the system /usr/bin/python3 if your python3 is another build
cd research/chip-p32passes
PYTHONPATH=src python3 -m unittest discover -s tests    # about 15 s
PYTHONPATH=src python3 experiments/run.py               # about 2 min on 4 cores; rewrites experiments/results.txt
```

## Results (from `experiments/results.txt`; cells of P = 32 minus P = 16, seeds 0 / 1 / 2)

| after pass | gap (cells) |
|---|---|
| coarse (end of synth `coarse`) | +638 / +773 / +640 |
| `opt -fast -full` | +456 / +516 / +472 |
| `memory_map` | +8616 / +8886 / +8632 |
| `opt -full` | +138 / +141 / +140 |
| `techmap` | +2100 / +2226 / +2120 |
| `opt -fast` (last pass before abc) | **-125 / -119 / -114** |
| `abc -fast` | -549 / -559 / -533 |
| final `opt -fast` | -514 / -522 / -498 |

- **The sign flips at the `opt -fast` that follows `techmap`, with no abc involved.** Bit-level, before any abc, P = 32 is already 114 to 125 cells smaller (about 1.5%) in all three seeds; `abc -fast` then adds roughly 400 more.
- **Correction to `chip-p32netlist`.** In Yosys 0.33 there is no `abc` label in `synth`, so `synth -run :abc` runs the whole script, `abc -fast` included. That project's "fine (pre-abc)" column (-514/-522/-498) is the final column above, *after* abc. Its conclusion that the sign is set before the flow-A abc call stands, and is now measured pre-abc (-114 to -125); its "bit-level, before abc" wording is wrong. `run.py` checks that the traced run ends on exactly the one-shot counts (equal in all six cases).
- `memory_map` turns the ROM tables into mux trees (+8,600 cells of gap) and `opt -full` removes almost all of it. The gap that survives into techmap (+2,100) is about the same as the word-level one in sign, and the first opt after techmap reverses it. Which constant-propagation step inside that opt does so was not isolated.

## Limitations
- Localised to a pass, not explained: `opt -fast` is several sub-passes (`opt_expr`, `opt_merge`, `opt_dff`, `opt_clean`), not split here, and the word-level cells are not typed.
- One Yosys version (0.33; a newer release may have an `abc` label and different counts), one task size, generic cell counts rather than area, no timing or layout.
- Intermediate counts such as `memory_map` are cells in a transient netlist, not a design size.

## Next steps
Split the post-techmap `opt -fast` into its sub-passes; repeat on a newer Yosys; test whether zeroing the idle-lane ROMs explicitly removes the gap.

## Owner steps
None needed.

## Outside dependencies
Yosys (apt), NumPy. No LLM API, OpenROAD or PDK. MIT-licensed.
