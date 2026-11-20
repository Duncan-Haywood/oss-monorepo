"""Milestone 7ai verdicts AI0-AI8 (predictions in ../../LOG.md, written before the full run) from results.json, 7ah's flights and
7ag's flown rise times. Per design: median over its 64 episodes (flown) or the single linear response. The lagged point mass is
7ag's posthoc.lagged via 7ah's verdicts.pred, scored against 7ag's flights unchanged. Writes verdicts.txt."""
import importlib.util, json, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("verdicts_7ah", os.path.join(HERE, "..", "m7ah_att_step", "verdicts.py"))
W = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(W)   # 7ah's verdicts: ident, pred, V (7ag), KEYS
V, KEYS = W.V, W.KEYS
SFX = "_smoke" if os.environ.get("SMOKE") == "1" else ""
R = json.load(open(os.path.join(HERE, f"results{SFX}.json")))
LIN = {(r["set"], r["geom"], r["seed"]): r for r in R["linear"]}
FL = {((r["set"], r["geom"], r["seed"]), r["var"], r["amp"]): r for r in R["resp"]}


def flown(var, field, amp):
    return np.array([np.nanmedian(np.array(FL[(k, var, amp)][field], float)) for k in KEYS])


def lin(model, field, amp):
    return np.array([LIN[k][f"{model}_{amp:g}"][field] for k in KEYS])


def main():
    L = []
    say = L.append
    n = len(KEYS)
    # AI0: reproduction of 7ah's 36 ms flights, per episode
    ah = {(V.key(r), r["amp"]): r for r in W.R["resp"] if r["law_name"] == W.MID}
    diff = max(np.nanmax(np.abs(np.array(FL[(k, "base", a)][f], float) - np.array(ah[(k, a)][f], float)))
               for k in KEYS for a in R["amps"] for f in ("tau", "t63"))
    dead = sum(r["dead"] for r in R["resp"])
    say(f"AI0 (check: base reproduces 7ah's 36 ms flights per episode, no flight dead): {'held' if diff < 1e-6 and dead == 0 else 'refuted'}; "
        f"max |difference| {diff:.2e} s; dead {dead} of {sum(len(r['tau']) for r in R['resp'])}")
    f63, ft = flown("base", "t63", 1.0), flown("base", "tau", 1.0)
    b63, bt, n63 = lin("box", "t63", 1.0), lin("box", "tau", 1.0), lin("nom", "t63", 1.0)
    c1 = int(np.sum(np.abs(b63 - f63) <= 0.015))
    say(f"AI1 (box-mean linear 63% time within 15 ms of flown for >= 34/36, A = 1): {'held' if c1 >= 34 else 'refuted'}; {c1}/{n}; "
        f"median |diff| {np.median(np.abs(b63 - f63)) * 1e3:.1f} ms, max {np.max(np.abs(b63 - f63)) * 1e3:.1f} ms, bias {np.median(b63 - f63) * 1e3:+.1f} ms")
    c2 = int(np.sum(np.abs(bt - ft) <= 0.010))
    say(f"AI2 (box-mean linear area tau within 10 ms of flown for >= 34/36, A = 1): {'held' if c2 >= 34 else 'refuted'}; {c2}/{n}; "
        f"median |diff| {np.median(np.abs(bt - ft)) * 1e3:.1f} ms, max {np.max(np.abs(bt - ft)) * 1e3:.1f} ms")
    c3 = int(np.sum(np.abs(n63 - f63) <= 0.015))
    say(f"AI3 (nominal-plant linear 63% time within 15 ms for >= 34/36): {'held' if c3 >= 34 else 'refuted'}; {c3}/{n}; "
        f"median |diff| {np.median(np.abs(n63 - f63)) * 1e3:.1f} ms, max {np.max(np.abs(n63 - f63)) * 1e3:.1f} ms; "
        f"nominal area tau within 10 ms: {int(np.sum(np.abs(lin('nom', 'tau', 1.0) - ft) <= 0.010))}/{n}")
    conds = [tuple(c) for c in V.R["conds"]]
    T = {c: V.table(*c) for c in conds}
    ah63 = W.ident("t63", 3.5)
    P_lin = {c: W.pred(b63, *c) for c in conds}
    P_ah = {c: W.pred(ah63, *c) for c in conds}
    cnt = {c: V.within_abs(T[c]["sim"], P_lin[c], 0.1) for c in conds}
    dm = {c: V.mae(T[c]["sim"], P_lin[c]) - V.mae(T[c]["sim"], P_ah[c]) for c in conds}
    ok4 = all(v >= 35 for v in cnt.values()) and all(v <= 0.005 for v in dm.values())
    say(f"AI4 (no-flight tau in the lagged point mass: >= 35/36 within 0.10 s in all 7 conditions, median |error| within 0.005 s of 7ah's flown 63% tau): "
        f"{'held' if ok4 else 'refuted'}; fewest {min(cnt.values())}/{n}; worst excess {max(dm.values()):+.4f} s")
    eb, en = flown("base", "early", 1.0), flown("nolat", "early", 1.0)
    ok5 = np.all(en <= 0.15) and np.median(eb) - np.median(en) >= 0.10
    say(f"AI5 (early jump is the side force: nolat 50 ms share <= 0.15 for all, base median exceeds nolat's by >= 0.10): {'held' if ok5 else 'refuted'}; "
        f"nolat max {np.max(en):.3f}, median {np.median(en):.3f}; base median {np.median(eb):.3f} (range {np.min(eb):.3f}-{np.max(eb):.3f}); "
        f"box-mean linear with lat: {np.median(lin('box', 'early', 1.0)):.3f}, lat = 0: {np.median(lin('box_nolat', 'early', 1.0)):.3f}")
    e1, e35, b35 = np.median(flown("exact", "ass", 1.0)), np.median(flown("exact", "ass", 3.5)), np.median(flown("base", "ass", 3.5))
    ok6 = abs(e35 - e1) <= 0.01 and b35 - e35 >= 0.03
    say(f"AI6 (lean map is the amplitude-dependent overshoot: exact a_ss/A at 3.5 within 0.01 of 1.0's, >= 0.03 below base's at 3.5): "
        f"{'held' if ok6 else 'refuted'}; exact {e1:.3f} (A=1), {e35:.3f} (A=3.5); base {np.median(flown('base', 'ass', 1.0)):.3f}, {b35:.3f}")
    fe, le = flown("exact", "ass", 3.5), lin("box", "ass", 3.5)
    c7 = int(np.sum(np.abs(fe - le) <= 0.01))
    say(f"AI7 (the rest is the loop's ring: exact-map flown a_ss/A at 3.5 within 0.01 of the box-mean linear's for >= 34/36): "
        f"{'held' if c7 >= 34 else 'refuted'}; {c7}/{n}; median |diff| {np.median(np.abs(fe - le)):.4f}; linear median {np.median(le):.3f} "
        f"(range {np.min(le):.3f}-{np.max(le):.3f})")
    d8 = np.abs(flown("nolat", "t63", 1.0) - f63)
    c8 = int(np.sum(d8 > 0.015))
    say(f"AI8 (side force is first-order in the lag: nolat 63% time differs from base's by > 15 ms for >= 12/36): {'held' if c8 >= 12 else 'refuted'}; "
        f"{c8}/{n}; median |diff| {np.median(d8) * 1e3:.1f} ms, max {np.max(d8) * 1e3:.1f} ms; nolat shorter for "
        f"{int(np.sum(flown('nolat', 't63', 1.0) < f63 - 0.015))}, longer for {int(np.sum(flown('nolat', 't63', 1.0) > f63 + 0.015))}")
    say("")
    say(f"{'A_P':>5} {'S':>4} | {'n<=0.1s pm/lin/7ah63':>20} | {'MAE pm':>6} {'lin':>6} {'7ah63':>6}")
    for c in conds:
        sim = T[c]["sim"]
        ns = "/".join(str(V.within_abs(sim, p, 0.1)) for p in (T[c]["pm"], P_lin[c], P_ah[c]))
        say(f"{c[0]:5.1f} {c[1]:4.1f} | {ns:>20} | {V.mae(sim, T[c]['pm']):6.3f} {V.mae(sim, P_lin[c]):6.3f} {V.mae(sim, P_ah[c]):6.3f}")
    out = "\n".join(L) + "\n"
    open(os.path.join(HERE, f"verdicts{SFX}.txt"), "w").write(out)
    print(out)
    return dict(T=T, P_lin=P_lin, P_ah=P_ah, b63=b63, f63=f63)


if __name__ == "__main__":
    main()
