"""Does the systolic-array vs MAC-engine ranking of chip-systolic-p32 survive other ABC scripts?
Same 10 designs per F (6 arrays, 4 MAC engines), F = 16, 32, same F-16-4 quantised MLP; each is simulated against the NumPy
reference, then scored under five ABC scripts (one process per F x script, 4 at a time). Writes experiments/results.txt.
Run: PYTHONPATH=src python experiments/run.py   # about 25 min on 4 cores"""
import os
import subprocess
from multiprocessing import Pool
from chip_systolic_abcrobust import baseline_gen, flow, gen, model

OUT = os.path.join(os.path.dirname(__file__), "results.txt")
FS, ARRAYS, PS, WB, NCHECK = (16, 32), ((1, 4), (1, 8), (1, 16), (2, 8), (2, 16), (4, 8)), (4, 8, 16, 32), 4, 32


def unit(job):
    f, sc = job
    xtr, ytr = model.make_data(0, 400, f)
    xte, _ = model.make_data(1, 400, f)
    q = model.quantise(model.train_float(xtr, ytr), xtr, WB)
    xi = q["xq"](xte[:NCHECK])
    ref = model.int_forward(q, xi)
    lines, best_arr, best_mac = [], None, None
    for r, c in ARRAYS:
        cy = gen.cycles(c, r, f, model.H)
        out, cs = flow.simulate(q, c, r, xi)
        ok = bool((out == ref).all()) and set(cs) == {cy}
        s = flow.score(q, c, r, sc)
        m = s["cells"] * cy // r
        best_arr = m if best_arr is None else min(best_arr, m)
        lines.append(f"{f:2d} {sc:13s} systolic {r}x{c:<2d} {cy:8d} {s['cells']:8d} {s['depth']:5d} {m:14d}  {ok}")
    for p in PS:
        cy = baseline_gen.cycles(p, f, model.H)
        out, cs = flow.simulate(q, 0, 1, xi, mac_lanes=p)
        ok = bool((out == ref).all()) and set(cs) == {cy}
        s = flow.score_baseline(q, p, sc)
        m = s["cells"] * cy
        best_mac = m if best_mac is None else min(best_mac, m)
        lines.append(f"{f:2d} {sc:13s} mac-lane P={p:<2d} {cy:7d} {s['cells']:8d} {s['depth']:5d} {m:14d}  {ok}")
    lines.append(f"F={f} {sc}: best array / best MAC engine (cells*cycles/vec) = {best_arr / best_mac:.2f}")
    return lines


if __name__ == "__main__":
    ver = subprocess.run(["yosys", "-V"], capture_output=True, text=True).stdout.strip()
    iv = subprocess.run(["iverilog", "-V"], capture_output=True, text=True).stdout.splitlines()[0]
    head = [f"# {ver}; {iv}",
            "# F-16-4 MLP, WB=%d; cells = Yosys generic-gate cells incl. flip-flops; metric = cells*cycles/vec" % WB,
            "# every design simulated on %d vectors against the NumPy reference and the cycle formula before scoring" % NCHECK,
            "F  script         design        cycles/batch  cells  depth  cells*cycles/vec  rtl==numpy"]
    jobs = [(f, sc) for f in FS for sc in flow.SCRIPTS]
    with Pool(4) as pool:
        res = pool.map(unit, jobs, chunksize=1)
    open(OUT, "w").write("\n".join(head + [l for r in res for l in r]) + "\n")
    print("\n".join(head + [l for r in res for l in r]))
