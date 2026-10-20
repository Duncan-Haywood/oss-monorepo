"""F=16, seeds 0-2: cells of P=16 and P=32 (identical cycles) after each Yosys stage. Writes results.txt."""
import os
import sys
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from chip_p32netlist import flow

F, SEEDS, PS = 16, (0, 1, 2), (16, 32)


def job(a):
    seed, p = a
    return a, flow.stages(flow.make_q(F, seed), p)


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        res = dict(ex.map(job, [(s, p) for s in SEEDS for p in PS]))
    out = ["F=16 MAC engine, Yosys 0.33. cells (flip-flops) after each stage; gap = P32 - P16", ""]
    out.append("seed stage   P16          P32          gap_cells gap_comb")
    for s in SEEDS:
        for st in flow.STAGES:
            a, b = res[(s, 16)][st], res[(s, 32)][st]
            out.append(f"{s:<4} {st:<7} {a['cells']:>5} ({a['ff']:>3}) {b['cells']:>5} ({b['ff']:>3}) {b['cells']-a['cells']:>9} {b['comb']-a['comb']:>8}")
    out += ["", "cell types after abc, seed 0 (P16 / P32):"]
    ta, tb = res[(0, 16)]["abc"]["types"], res[(0, 32)]["abc"]["types"]
    for t in sorted(set(ta) | set(tb)):
        out.append(f"  {t:<16} {ta.get(t, 0):>5} {tb.get(t, 0):>5}")
    text = "\n".join(out) + "\n"
    open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(text)
    print(text)
