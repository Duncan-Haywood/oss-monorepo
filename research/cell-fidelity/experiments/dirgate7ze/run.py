"""Milestone 7ze: a direction-aware drift gate (gS) for 7c's corrected ten-cycle forecast inside 7h's rule.

    python experiments/dirgate7ze/run.py report     # H377 to H381 -> results.txt, summary.json (4 processes, ~1 min)

7y's drift-size gate gD switches the corrected forecast on when the training rows' median |m - 1| >= 0.10. It never
asks which way the drift runs, so it is on for the four committed sets, whose drift runs both ways, and costs there.
gS adds the sign test, read from the four training pools only:

    s   = max(#{m > 1}, #{m < 1}) / #{m != 1}      (direction share of the training designs' drift multipliers)
    gS  on if gD is on and s >= 0.80               (sensitivity: 0.70, 0.90)

thetaS = 7x's thetaH where gS is on, 7h's theta where it is off. No new simulation and no refit: gS picks, fold by fold,
between the thetaH and theta outcomes already stored by 7y, 7za, 7zc and 7zd. Plan in ../../LOG.md (7ze plan).
"""
import importlib.util
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
ROOT = EXP.parent
S_MIN = 0.80
S_SENS = (0.70, 0.90)
D_MIN = 0.10
EIGHT = ("four", "f30", "m30", "sei")
SEVEN = ("four", "f30", "m30")
EXTRA = ("f10", "sei1")                          # reported, not in the verdicts
STORED = {"m30": "marq7za", "sei": "sei7zc/rules", "sei1": "sei7zd/rho1e-01/rules"}
ROWS = {"m30": "plating7z", "sei": "sei7zc", "sei1": "sei7zd/rho1e-01"}
SET_LABEL = {"sei": "Marquis2019-SEI", "sei1": "Marquis2019-SEI"}


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


# ---------- pure helpers (tested) ----------

def verdict(sup, ref):
    return "supported" if sup else ("refuted" if ref else "inconclusive")


def share(ms):
    """Direction share: the larger of the counts above and below 1, over the multipliers not equal to 1."""
    up = sum(1 for m in ms if m > 1)
    dn = sum(1 for m in ms if m < 1)
    return max(up, dn) / (up + dn) if up + dn else float("nan")


def med(xs):
    v = sorted(xs)
    n = len(v)
    return v[n // 2] if n % 2 else 0.5 * (v[n // 2 - 1] + v[n // 2])


def gate_d(ms, thr=D_MIN):
    return bool(ms) and med([abs(m - 1) for m in ms]) >= thr


def gate_s(ms, s_min=S_MIN, d_min=D_MIN):
    s = share(ms)
    return gate_d(ms, d_min) and s == s and s >= s_min


def compose(on, f_h, f_t):
    """Per fold, the thetaH outcome where the gate is on, else theta's (folds keyed by (set, pool))."""
    H = {(f["set"], f["pool"]): f for f in f_h}
    T = {(f["set"], f["pool"]): f for f in f_t}
    assert set(H) == set(T) == set(on)
    return [dict(H[k] if on[k] else T[k]) for k in sorted(T)]


def set_on(on):
    """Set-level decision: on in at least 3 of its 5 folds."""
    by = {}
    for (st, _), v in on.items():
        by.setdefault(st, []).append(v)
    return {st: sum(v) >= 3 for st, v in by.items()}


def judge(agree, met, boot8, mean8, boot7, changes):
    """H377 to H381. agree: sets (of 8) where gS's set decision matches the oracle; met: thetaS's met folds of 40;
    boot8/mean8: eight-condition interval and mean of thetaS - theta; boot7: seven-condition interval;
    changes: the larger number of set decisions that a sensitivity threshold changes."""
    return dict(
        H377=verdict(agree == 8, agree <= 6),
        H378=verdict(met >= 37, met <= 35),
        H379=verdict(boot8[1] < 0 and mean8 <= -14.67 + 1e-9, boot8[0] > 0 or mean8 > -14.67 + 1e-9),
        H380=verdict(boot7[1] < 0, boot7[0] > 0),
        H381=verdict(changes <= 1, changes >= 2))


# ---------- data ----------

def drift_rows():
    """{cond: {(set, pool): [m of every design in that pool]}}, rebuilt with the code that made the stored folds."""
    Y = _mod("gate7y_run", EXP / "gate7y" / "run.py")
    X = Y._x()
    V = X._v()
    out = {}
    c = X.committed()
    out["four"] = {}
    for r in c["rows"]:
        out["four"].setdefault((r["set"], r["pool"]), []).append(c["inp"][r["k"]]["m"])
    for src, tag in V.SOURCES:
        out[tag] = {}
        for r in V._rows(src):
            out[tag].setdefault((r["set"], r["pool"]), []).append(r["m"])
    for tag, src in ROWS.items():
        out[tag] = {}
        for r in V._rows(src):
            out[tag].setdefault((SET_LABEL.get(tag, r["set"]), r["pool"]), []).append(r["m"])
    return out


def stored():
    """{cond: dict(folds={rule: [...]}, gates_D={(set, pool): bool}, oracle={set: rule})}."""
    y = json.loads((EXP / "gate7y" / "summary.json").read_text())
    out = {}
    for tag in ("four", "f30", "f10"):
        F = {r: y[tag]["folds"][r] for r in ("theta", "U", "thetaH", "thetaN", "thetaD")}
        pools = {}
        for f in F["theta"]:
            pools.setdefault(f["set"], []).append(f["pool"])
        gD = {(st, p): on for st, gs in y[tag]["gates"]["D"].items() for p, on in zip(pools[st], gs)}
        out[tag] = dict(folds=F, gates_D=gD, oracle=y["oracle"][tag])
    for tag, src in STORED.items():
        z = json.loads((EXP / src / "summary.json").read_text())
        lab = SET_LABEL.get(tag)
        F = {r: [dict(f, set=lab or f["set"]) for f in z["folds"][r]]
             for r in ("theta", "U", "thetaH", "thetaN", "thetaD")}
        st = F["theta"][0]["set"]
        gD = {(st, f["pool"]): on for f, on in zip(F["theta"], z["gates"]["D"])}
        out[tag] = dict(folds=F, gates_D=gD, oracle={st: z["oracle"]})
    return out


def report():
    T = _mod("paper_tables", ROOT / "paper" / "tables.py")
    M = drift_rows()
    St = stored()
    R, ctrl = {}, dict(gD_mismatch=0, gD_folds=0, thetaD_recompose=0.0)
    for tag in EIGHT + EXTRA:
        F = St[tag]["folds"]
        pools_of = {}
        for (st, p) in M[tag]:
            pools_of.setdefault(st, []).append(p)
        on, sv, sens, gd = {}, {}, {t: {} for t in S_SENS}, {}
        for f in F["theta"]:
            st, p = f["set"], f["pool"]
            tr = [m for q in pools_of[st] if q != p for m in M[tag][(st, q)]]
            k = (st, p)
            gd[k] = gate_d(tr)
            on[k] = gate_s(tr)
            sv[k] = share(tr)
            for t in S_SENS:
                sens[t][k] = gate_s(tr, t)
            ctrl["gD_folds"] += 1
            ctrl["gD_mismatch"] += int(gd[k] != St[tag]["gates_D"][k])
        rec = compose(gd, F["thetaH"], F["theta"])
        key = lambda f: (f["set"], f["pool"])
        ctrl["thetaD_recompose"] = max(ctrl["thetaD_recompose"], max(
            abs(a["cycles"] - b["cycles"]) + (bool(a["met"]) != bool(b["met"]))
            for a, b in zip(rec, sorted(F["thetaD"], key=key))))
        F["thetaS"] = compose(on, F["thetaH"], F["theta"])
        for t in S_SENS:
            F[f"thetaS{t:.2f}"] = compose(sens[t], F["thetaH"], F["theta"])
        R[tag] = dict(on=on, share=sv, sens=sens, set_on=set_on(on),
                      set_sens={t: set_on(sens[t]) for t in S_SENS})
    RULES = ("U", "theta", "thetaH", "thetaN", "thetaD", "thetaS") + tuple(f"thetaS{t:.2f}" for t in S_SENS)
    pool = lambda conds, r: [f for c in conds for f in St[c]["folds"][r]]
    tot, pairs = {}, {}
    for name, conds in (("eight", EIGHT), ("seven", SEVEN), ("four", ("four",)),
                        ("eight_r", SEVEN + ("sei1",)), ("eight_f10", ("four", "f10", "m30", "sei"))):
        tot[name] = {r: T.agg(pool(conds, r)) for r in RULES}
        pairs[name] = {r: T.pair_stats(pool(conds, r), pool(conds, "theta")) for r in RULES if r != "theta"}
        pairs[name + "_u"] = {r: T.pair_stats(pool(conds, r), pool(conds, "U")) for r in RULES if r != "U"}
    agree, sets = 0, []
    for tag in EIGHT:
        for st, o in St[tag]["oracle"].items():
            want = o == "thetaH"
            got = R[tag]["set_on"][st]
            agree += int(want == got)
            sets.append((tag, st))
    changes = max(sum(int(R[tag]["set_sens"][t][st] != R[tag]["set_on"][st]) for tag, st in sets) for t in S_SENS)
    p8, p7 = pairs["eight"]["thetaS"], pairs["seven"]["thetaS"]
    Vd = judge(agree, tot["eight"]["thetaS"]["met"], p8["boot"], p8["mean"], p7["boot"], changes)

    yn = lambda xs: "".join("y" if x else "n" for x in xs)
    L = ["cell-fidelity milestone 7ze: a direction-aware drift gate gS = gD and direction share s >= 0.80 (training rows",
         "only); thetaS = thetaH where gS is on, theta where off. No new simulation, no refit: stored thetaH/theta folds.",
         "",
         f"control: gD recomputed from rebuilt m vs stored gD: {ctrl['gD_mismatch']} mismatches of {ctrl['gD_folds']} "
         f"folds; stored thetaH/theta recomposed under gD vs stored thetaD (cycles + met) = {ctrl['thetaD_recompose']:.2e}",
         "",
         f"{'cond:set':24s}{'oracle':>8s}  {'s per fold':34s}{'gD':>7s}{'gS':>7s}{'s.70':>7s}{'s.90':>7s}"]
    for tag in EIGHT + EXTRA:
        for st, o in St[tag]["oracle"].items():
            ks = sorted(k for k in R[tag]["on"] if k[0] == st)
            L.append(f"{tag + ':' + st:24s}{o:>8s}  "
                     + f"{' '.join('%.2f' % R[tag]['share'][k] for k in ks):34s}"
                     + f"{yn(St[tag]['gates_D'][k] for k in ks):>7s}{yn(R[tag]['on'][k] for k in ks):>7s}"
                     + f"{yn(R[tag]['sens'][0.70][k] for k in ks):>7s}{yn(R[tag]['sens'][0.90][k] for k in ks):>7s}"
                     + ("" if tag in EXTRA else ("  agrees" if (o == "thetaH") == R[tag]["set_on"][st] else "  DISAGREES")))
    L += ["", f"{'pooling / rule':26s}{'met':>7s}{'cyc':>7s}{'rule - theta':>14s}{'set boot 95%':>20s}{'ch/de':>7s}"
          f"{'p':>7s}{'rule - U':>10s}{'set boot 95%':>20s}"]
    for name in ("eight", "seven", "four", "eight_r", "eight_f10"):
        L.append(f"  {name} ({tot[name]['theta']['n']} folds):")
        for r in RULES:
            a = tot[name][r]
            line = f"  {r:24s}{a['met']:>3d}/{a['n']:<3d}{a['cycles']:7.1f}"
            if r != "theta":
                q = pairs[name][r]
                line += f"{q['mean']:+14.2f}{q['boot'][0]:+10.2f} to {q['boot'][1]:+6.2f}{q['cheaper']:>4d}/{q['dearer']:<3d}" \
                        f"{q['sign_p']:6.3f}"
            else:
                line += f"{'(reference)':>14s}{'':37s}"
            if r != "U":
                q = pairs[name + "_u"][r]
                line += f"{q['mean']:+10.2f}{q['boot'][0]:+10.2f} to {q['boot'][1]:+6.2f}"
            L.append(line)
    L += ["", f"set decisions agreeing with the oracle: {agree} of 8; most set decisions changed by a sensitivity "
              f"threshold: {changes}"]
    for h, t in (("H377", "gS's set decisions match the oracle on all 8 sets"),
                 ("H378", "thetaS meets >= 37 of 40 folds"),
                 ("H379", "eight conditions: interval of thetaS - theta below zero and mean <= -14.67"),
                 ("H380", "seven conditions: interval of thetaS - theta below zero"),
                 ("H381", "thresholds 0.70 / 0.90 change at most one set decision")):
        L.append(f"{h} ({t}): {Vd[h]}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    js = lambda d: {f"{k[0]}|{k[1]}": v for k, v in d.items()}
    out = dict(verdicts=Vd, control=ctrl, agree=agree, changes=changes, total=tot, pair=pairs,
               gates={tag: dict(S=js(R[tag]["on"]), share=js(R[tag]["share"]), set_on=R[tag]["set_on"],
                                sens={str(t): js(v) for t, v in R[tag]["sens"].items()}) for tag in R},
               folds={tag: {r: St[tag]["folds"][r] for r in ("thetaS",) + tuple(f"thetaS{t:.2f}" for t in S_SENS)}
                      for tag in R})
    (HERE / "summary.json").write_text(json.dumps(out, indent=1, default=str) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"report": report}[sys.argv[1]]()
