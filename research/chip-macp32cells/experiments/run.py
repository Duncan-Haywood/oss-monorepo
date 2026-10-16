"""Is P=32 smaller than P=16 at equal cycles (chip-systolic-p32) a real effect or an abc artefact?
P = 8, 16, 32, 64 lanes; F = 16, 32; model seeds 0-2 (different weights); three Yosys flows. Writes experiments/results.txt.
Run: PYTHONPATH=src python experiments/run.py"""
import os
import subprocess
from concurrent.futures import ProcessPoolExecutor
from chip_macp32cells import baseline_gen, flow

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
FS, PS, SEEDS, FLOWS = (16, 32), (8, 16, 32, 64), (0, 1, 2), ("A", "B", "C")


def job(a):
    f, seed, fl, p = a
    return a, flow.score(flow.make_q(f, seed), p, fl)


if __name__ == "__main__":
    ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    jobs = [(f, s, fl, p) for f in FS for s in SEEDS for fl in FLOWS for p in PS]
    with ProcessPoolExecutor() as ex:
        res = dict(ex.map(job, jobs))
    L = [f"# {ver}", "# F-16-4 MLP, WB=4; flows A (abc -g 9 gates), B (abc -g AND,OR,XOR,MUX), C (abc -fast -g 9 gates)",
         "F  seed flow  P  cycles  cells   ff  comb"]
    for (f, s, fl, p), r in res.items():
        L.append(f"{f:2d} {s:4d} {fl:4s} {p:3d} {baseline_gen.cycles(p, f):6d} {r['cells']:6d} {r['ff']:5d} {r['comb']:5d}")
    L.append("")
    L.append("# P=32 minus P=16 (cells), per F / flow / seed; negative = P=32 smaller")
    neg = tot = 0
    for f in FS:
        for fl in FLOWS:
            d = [res[(f, s, fl, 32)]["cells"] - res[(f, s, fl, 16)]["cells"] for s in SEEDS]
            neg += sum(x < 0 for x in d); tot += len(d)
            L.append(f"F={f} flow {fl}: {d}")
    L.append(f"P=32 smaller than P=16 in {neg} of {tot} (F, flow, seed) cells")
    open(OUT, "w").write("\n".join(L) + "\n")
    print("\n".join(L))
