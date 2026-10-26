"""Does rotor cant still pay once the vehicle must hold position? Task: start up to 0.5 m off the origin in a gust, hold it, while yaw steps +-30 deg; roll/pitch references come from an outer
position loop. A canted rotor makes a body-lateral force tan(alpha)/r per unit commanded roll/pitch torque; `couple` switches that force on (physical) or off (the attitude-only model).
JOINT CMA-ES over (L, D, cant, 6 attitude gains, 3 position gains), BUDGET evaluations, 5 seeds, held-out 64 wide-plant episodes. Designs optimised with coupling on are re-scored with it off and
vice versa, to see whether ignoring the force in design costs anything. No LLM is used."""
import json, os, sys, warnings
from multiprocessing import Pool
import numpy as np
import cma

warnings.filterwarnings("ignore")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_aero_cant_poshold import aero as A

TRAIN_EP, TEST_EP, TRAIN_SEED, TEST_SEED = 16, 64, 100, 9999
BUDGET, SEEDS = 3200, 5
CELLS = [(0, True), (35, True), (35, False), (80, True), (80, False)]


def cell(args):
    cap, couple, s = args
    am = np.deg2rad(max(cap, 1e-9))
    es = cma.CMAEvolutionStrategy([0.5] * 12, 0.25, {"bounds": [0, 1], "seed": s + 1, "popsize": 16, "verbose": -9})
    best, bx, n = -1e9, None, 0
    while n < BUDGET:
        xs = np.array(es.ask()); ys = A.score_pos(xs[:, :3], xs[:, 3:], TRAIN_EP, TRAIN_SEED + s, alpha_max=am, couple=couple)[0]
        n += len(xs); es.tell(xs.tolist(), (-ys).tolist())
        if ys.max() > best: best, bx = ys.max(), xs[int(np.argmax(ys))].copy()
    out = dict(cap=cap, couple=couple, seed=s, alpha_deg=float(np.rad2deg(am * bx[2])))
    for evc in (True, False):
        J, sz, pos, yaw = A.score_pos(bx[None, :3], bx[None, 3:], TEST_EP, TEST_SEED, alpha_max=am, couple=evc, parts=True)
        out["on" if evc else "off"] = dict(J=float(-J[0]), pos=float(pos[0]), yaw=float(yaw[0]), ok=bool(sz["feasible"][0]))
    out.update(mass=float(sz["mass"][0]), cost=float(sz["cost"][0]), L=float(sz["L"][0]), D=float(sz["D"][0]))
    return out


if __name__ == "__main__":
    jobs = [(c, k, s) for c, k in CELLS for s in range(SEEDS)]
    with Pool() as p:
        out = p.map(cell, jobs)
    m = lambda rs, f: float(np.mean([f(r) for r in rs]))
    lines = [f"JOINT co-design with position hold, {BUDGET} evaluations, held-out {TEST_EP} wide-plant episodes, {SEEDS} seeds. J = sqrt((pos/{A.POS_SCALE_M} m)^2 + (yaw/{A.YAW_SCALE_DEG} deg)^2)",
             "trained   bound  scored   J      pos RMS m  yaw RMS deg  chosen cant (deg)       mass kg  cost $  feasible"]
    table = []
    for cap, couple in CELLS:
        rs = [r for r in out if r["cap"] == cap and r["couple"] == couple]
        for ev in ("on", "off"):
            if cap == 0 and ev == "off": continue
            row = dict(cap=cap, trained_coupled=couple, scored_coupled=ev == "on", J=m(rs, lambda r: r[ev]["J"]), J_seeds=[r[ev]["J"] for r in rs],
                       pos=m(rs, lambda r: r[ev]["pos"]), yaw=m(rs, lambda r: r[ev]["yaw"]), alpha=[r["alpha_deg"] for r in rs], mass=m(rs, lambda r: r["mass"]),
                       cost=m(rs, lambda r: r["cost"]), feasible=int(sum(r[ev]["ok"] for r in rs)))
            table.append(row)
            lines.append(f"{'on ' if couple else 'off'}      {cap:4d}   {ev:3s}   {row['J']:5.2f} ({', '.join(f'{v:.2f}' for v in row['J_seeds'])})  {row['pos']:.3f}  {row['yaw']:6.2f}   {', '.join(f'{a:.0f}' for a in row['alpha']):20s}  {row['mass']:5.2f}  {row['cost']:5.0f}  {row['feasible']}/{SEEDS}")
    lines += ["", "Paired against bound 0, scored with the physical (coupled) model, same seed; negative = cant helps"]
    base = {r["seed"]: r["on"] for r in out if r["cap"] == 0}
    for cap, couple in CELLS[1:]:
        rs = [r for r in out if r["cap"] == cap and r["couple"] == couple]
        for key, nm in (("J", "J"), ("pos", "pos m"), ("yaw", "yaw deg")):
            d = [r["on"][key] - base[r["seed"]][key] for r in rs]
            lines.append(f"  trained {'on ' if couple else 'off'} bound {cap:2d} {nm:8s}: mean {np.mean(d):+.3f}, better in {sum(x < 0 for x in d)} of {len(d)}")
    lines += ["", "Cost of ignoring the lateral force in design (design trained coupling-off, scored coupled, minus trained coupled, same seed), J"]
    for cap in (35, 80):
        a = {r["seed"]: r["on"]["J"] for r in out if r["cap"] == cap and r["couple"]}
        d = [r["on"]["J"] - a[r["seed"]] for r in out if r["cap"] == cap and not r["couple"]]
        lines.append(f"  bound {cap}: mean {np.mean(d):+.3f}, worse in {sum(x > 0 for x in d)} of {len(d)}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(lines) + "\n")
    json.dump(dict(cells=CELLS, table=table, runs=out), open(os.path.join(HERE, "results.json"), "w"))
    print("\n".join(lines))
