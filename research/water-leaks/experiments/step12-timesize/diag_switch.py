"""After-the-run diagnostic for step 12 (declared after results.txt was read; not pre-registered).

Does the time-resolved signature lose because of PUMP_1's on/off control? In the nominal 24 h run
the pump switches on T1's level (CONTROLS: closed above 3.9 m, open below 2.4 m), and a leak
anywhere moves the switching hour, which puts a step of up to ~0.9 m on sensor n54 in hours 15 to
17 whatever the leak size. This rescores methods B and D on the oracle-timed 32 with the
signature hours 15, 16 and 17 (hour of day) left out of both residual and signature.

    PYTHONPATH=src python experiments/step12-timesize/diag_switch.py   # after run.py (uses its cache)
"""
from __future__ import annotations

import importlib.util
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("run12", HERE / "run.py")
run12 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run12)
from water_leaks import data, harness, localise, network  # noqa: E402

DROP = {15, 16, 17}


def main():
    S_ = harness.setup()
    hrs, P, F, Lv, events, pcols, links = (S_[k] for k in ("hrs", "P", "F", "Lv", "events", "pcols", "links"))
    fc = list(S_["fcols"])
    supply = (F[:, fc.index("p227")] + F[:, fc.index("p235")])[:, None]
    nodes = run12.step11.junctions(data.fetch("L-TOWN.inp").read_text())
    SH = {q: run12.hourly_signatures(None, pcols, nodes, q) for q in run12.GRID}
    A = localise.design_noflow(hrs, Lv)
    flows = run12.step8.leak_flows(hrs)
    first = hrs[(run12.G + run12.WMIN) * 24]
    H = np.abs(SH[1.0])
    out = ["# step 12 after-the-run diagnostic: time-resolved signatures without the pump-switch hours 15-17",
           "largest |dp| at q = 1 over junctions and sensors (m), by hour of day: "
           + " ".join(f"{h}:{H[:, h, :].max():.2f}" for h in range(24)),
           f"junctions whose q = 1 signature moves any sensor > 0.3 m in hours 15-17: {(H[:, 15:18, :].max(axis=(1, 2)) > 0.3).sum()} of {len(nodes)}; "
           f"sensor carrying it: {pcols[int(np.argmax(H[:, 15:18, :].max(axis=(0, 1))))]}", ""]
    res = {"B": [], "D": [], "Bx": [], "Dx": []}
    for i, e in enumerate(events):
        if not e[1] >= first:
            continue
        pipe = e[0]
        t = int(np.nonzero(flows[pipe] >= 0.5 * flows[pipe].max())[0][0])
        R = localise.residual_hourly(P, A, t)
        qu = localise.nearest_q(float(localise.residual_hourly(supply, A, t).mean()), run12.GRID)
        hod0 = int((hrs[t] - hrs[t].astype("datetime64[D]")).astype(int))
        keep = np.array([(hod0 + k) % 24 not in DROP for k in range(24)])
        a, b = links[pipe][0], links[pipe][1]
        da, db = network.graph_dist(links, a), network.graph_dist(links, b)
        d = np.array([min(da.get(n, np.inf), db.get(n, np.inf)) + links[pipe][2] / 2 for n in nodes])
        for k, q in (("B", 5.0), ("D", qu)):
            al = localise.aligned(SH[q], hod0)
            res[k].append(d[int(np.argmax(localise.scores_tr(R, al)))])
            res[k + "x"].append(d[int(np.argmax(localise.scores_tr(R[keep], al[:, keep])))])
    for k, label in (("B", "B time-resolved, q = 5"), ("Bx", "B without hours 15-17"),
                     ("D", "D time-resolved, q = flow balance"), ("Dx", "D without hours 15-17")):
        v = np.array(res[k])
        out.append(f"oracle-timed 32: {label:<36} within 300 m {int((v <= 300).sum()):>2}/32, median error {np.median(v):5.0f} m")
    (HERE / "diag_switch.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
