"""Milestone 7ah verdicts AH0-AH8 (predictions in ../../LOG.md, written before the full run) from results.json and 7ag's flights.

Identified lag per design = median over its 64 episodes of the area estimate (or of the 63% time, for AH7). The lagged point mass
is 7ag's posthoc.lagged, given each design's identified tau (36 ms law, the amplitude named), and scored against the rise times
7ag flew (36 ms law, b = 0.25 m), unchanged. Writes verdicts.txt."""
import importlib.util, json, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
AGD = os.path.join(HERE, "..", "m7ag_cruise")
sys.path.insert(0, AGD)
_spec = importlib.util.spec_from_file_location("verdicts_7ag", os.path.join(AGD, "verdicts.py"))
V = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(V)   # 7ag's verdicts (same file name as this one)
from posthoc import lagged  # noqa: E402

SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
MID, OTHER = V.MID, V.OTHER
TAU_FIT = 0.135            # 7ag's post hoc fit on (3.5, 1)
KEYS = V.KEYS


def med(v):
    return V.med(v)


def ident(field, amp, law=MID):
    c = {V.key(r): r for r in R["resp"] if r["amp"] == amp and r["law_name"] == law}
    return np.array([med(c[k][field]) for k in KEYS])


def pred(taus, a, s):
    kp, kd, ki = (np.array([V.G[k][f] for k in KEYS]) for f in ("kp", "kd", "ki"))
    taus = np.broadcast_to(np.asarray(taus, float), (len(KEYS),))
    return np.array([lagged(kp[i:i + 1], kd[i:i + 1], ki[i:i + 1], a, s, V.B, float(taus[i]))[0][0] for i in range(len(KEYS))])


def main():
    conds = [tuple(c) for c in V.R["conds"]]
    T = {c: V.table(*c) for c in conds}
    L = []
    say = lambda s: L.append(s)
    dead = sum(r["dead"] for r in R["resp"])
    ass = {a: ident("a_ss", a) for a in R["amps"]}
    ok0 = dead == 0 and all(np.all(np.abs(ass[a] / a - 1) <= 0.10) for a in R["amps"])
    say(f"AH0 (check: no flight dead, a_ss within 10% of the request for every design): {'held' if ok0 else 'refuted'}; "
        f"dead {dead}; a_ss/A median {', '.join(f'{a:g}: {np.median(ass[a] / a):.3f} ({np.min(ass[a] / a):.3f}-{np.max(ass[a] / a):.3f})' for a in R['amps'])}")
    t1, t35 = ident("tau", 1.0), ident("tau", 3.5)
    n1 = min(int(np.sum(np.abs(ident("tau", 3.5, law) - t35) <= 0.010)) for law in OTHER)
    say(f"AH1 (law does not move tau: under 33 and 39.1 ms, per-design tau within 10 ms of the 36 ms law's for >= 34/36, A = 3.5): "
        f"{'held' if n1 >= 34 else 'refuted'}; worse law {n1}/36; median tau by law "
        + ", ".join(f"{law}: {np.median(ident('tau', 3.5, law)) * 1000:.1f} ms" for law in (OTHER[0], MID, OTHER[1])))
    n2 = int(np.sum(np.abs(t35 - t1) <= 0.015))
    say(f"AH2 (amplitude does not move tau: per-design tau at 3.5 within 15 ms of tau at 1.0 for >= 34/36): {'held' if n2 >= 34 else 'refuted'}; "
        f"{n2}/36; median tau A=1: {np.median(t1) * 1000:.1f} ms, A=3.5: {np.median(t35) * 1000:.1f} ms; "
        f"range at 3.5: {np.min(t35) * 1000:.0f}-{np.max(t35) * 1000:.0f} ms")
    m = float(np.median(t35))
    say(f"AH3 (identified tau agrees with 7ag's fitted 135 ms: median over designs within 110-160 ms, A = 3.5): "
        f"{'held' if 0.110 <= m <= 0.160 else 'refuted'}; {m * 1000:.1f} ms; 63% time median {np.median(ident('t63', 3.5)) * 1000:.1f} ms")
    P_id = {c: pred(t35, *c) for c in conds}
    P_pool = {c: pred(m, *c) for c in conds}
    P_63 = {c: pred(ident("t63", 3.5), *c) for c in conds}
    P_fit = {c: pred(TAU_FIT, *c) for c in conds}
    w8, w05 = V.within_abs(T[(8.0, 1.0)]["sim"], P_id[(8.0, 1.0)], 0.1), V.within_abs(T[(3.5, 0.5)]["sim"], P_id[(3.5, 0.5)], 0.1)
    say(f"AH4 (per-design identified tau: within 0.10 s for >= 33/36 at A_P 8 and 36/36 at S 0.5): {'held' if w8 >= 33 and w05 == 36 else 'refuted'}; "
        f"{w8}/36 and {w05}/36")
    better = [V.mae(T[c]["sim"], P_id[c]) < V.mae(T[c]["sim"], T[c]["pm"]) for c in conds]
    say(f"AH5 (per-design identified tau has the smaller median |error| than the no-lag point mass in all 7 conditions): "
        f"{'held' if all(better) else 'refuted'}; {sum(better)}/7")
    b6 = sum(V.mae(T[c]["sim"], P_id[c]) < V.mae(T[c]["sim"], P_pool[c]) for c in conds)
    say(f"AH6 (per-design tau beats one pooled tau, the median, in median |error| in >= 5 of 7 conditions): {'held' if b6 >= 5 else 'refuted'}; {b6}/7")
    b7 = sum(V.mae(T[c]["sim"], P_63[c]) <= V.mae(T[c]["sim"], P_id[c]) for c in conds)
    say(f"AH7 (63% time does at least as well as the area estimate in >= 5 of 7 conditions): {'held' if b7 >= 5 else 'refuted'}; {b7}/7")
    d8 = [V.mae(T[c]["sim"], P_id[c]) - V.mae(T[c]["sim"], P_fit[c]) for c in conds]
    say(f"AH8 (identified tau's median |error| within 0.01 s of the fitted 135 ms's in every condition): "
        f"{'held' if max(d8) <= 0.010 else 'refuted'}; worst excess {max(d8):+.4f} s")
    say("")
    say(f"{'A_P':>5} {'S':>4} | {'n<=0.1s pm/id/63/pool/fit':>26} | {'MAE pm':>6} {'id':>6} {'t63':>6} {'pool':>6} {'fit135':>6} | {'bias id':>7}")
    for c in conds:
        sim = T[c]["sim"]
        ns = "/".join(str(V.within_abs(sim, p, 0.1)) for p in (T[c]["pm"], P_id[c], P_63[c], P_pool[c], P_fit[c]))
        say(f"{c[0]:5.1f} {c[1]:4.1f} | {ns:>26} | {V.mae(sim, T[c]['pm']):6.3f} {V.mae(sim, P_id[c]):6.3f} {V.mae(sim, P_63[c]):6.3f} "
            f"{V.mae(sim, P_pool[c]):6.3f} {V.mae(sim, P_fit[c]):6.3f} | {np.nanmedian(sim - P_id[c]):+7.3f}")
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)
    return dict(T=T, P_id=P_id, t35=t35)


if __name__ == "__main__":
    main()
