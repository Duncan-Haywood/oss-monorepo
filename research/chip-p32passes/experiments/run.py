"""F=16, seeds 0-2: cells of the P=16 and P=32 MAC engines after each Yosys pass of synth's `fine` section. Writes results.txt."""
import os
import sys
from concurrent.futures import ProcessPoolExecutor
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from chip_p32passes import baseline_gen, flow

F, SEEDS, PS = 16, (0, 1, 2), (16, 32)


def job(a):
    seed, p = a
    v = baseline_gen.verilog(flow.make_q(F, seed), p)
    tr = flow.trace(v)
    return a, (tr, flow.one_shot(v))


if __name__ == "__main__":
    with ProcessPoolExecutor() as ex:
        res = dict(ex.map(job, [(s, p) for s in SEEDS for p in PS]))
    out = ["F=16 MAC engine, Yosys 0.33. Cells after each pass; gap = P32 - P16", ""]
    out.append(f"{'seed':<5}{'after':<14}{'P16':>7}{'P32':>7}{'gap':>7}")
    for s in SEEDS:
        for (lab, a), (_, b) in zip(res[(s, 16)][0], res[(s, 32)][0]):
            out.append(f"{s:<5}{lab:<14}{a:>7}{b:>7}{b - a:>7}")
    out += ["", "check: last traced count equals the one-shot `synth -run :abc` count"]
    for s in SEEDS:
        for p in PS:
            tr, one = res[(s, p)]
            out.append(f"seed {s} P{p}: traced {tr[-1][1]}, one-shot {one}, {'equal' if tr[-1][1] == one else 'DIFFER'}")
    text = "\n".join(out) + "\n"
    open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(text)
    print(text)
