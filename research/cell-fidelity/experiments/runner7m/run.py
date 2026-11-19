"""Milestone 7m: the triage runner as an artefact, replayed on the 64 designs of the 7h pool.

    python experiments/runner7m/run.py policy                 # policy.json from committed rows (stdlib, seconds)
    WORKERS=3 OMP_NUM_THREADS=1 python experiments/runner7m/run.py bench   # per design: T (runner) and A (pybamm)
    python experiments/runner7m/run.py report                 # H297 to H300 -> results.txt, summary.json

7l found that a `Simulation` extended in place pays no second fixed cost, so the paper's triage rule can run as one
process per design that looks at cycle 10 and then stops or keeps solving. `triage.py` is that runner. This step
runs it on every design of the 7h pool, whose offline drift scores and decisions are already known, under the
"replay7h" policy (7h's refit theta50 rule: picked on 5zk, 5zy, 5zz and 7g, never on 7h; 7c's correction fitted on
the 104 earlier designs), and times it against a fresh 50-cycle run of the same design (7l's A, lean recorder).
Plan in ../../LOG.md (7m plan).
"""
import importlib.util
import json
import os
import statistics
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent
WORKERS = int(os.environ.get("WORKERS", "3"))
CELL = "000"


def _mod(name, path):
    if name in sys.modules:
        return sys.modules[name]
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    sys.modules[name] = m
    spec.loader.exec_module(m)
    return m


T = _mod("runner7m_triage", HERE / "triage.py")
L7 = _mod("keep7l_run", EXP / "keep7l" / "run.py")
R7K = L7.R7K
SETS = R7K.SETS
quart, verdict = R7K.quart, R7K.verdict
BAND = 0.01          # decisions within 1% of theta are reported, not tested (fixed in the plan)


def _load(path):
    with open(path) as fh:
        return [json.loads(l) for l in fh if l.strip()]


# ---------- policy (stdlib, from committed rows) ----------

def fit_line(rows, obs_names, spearman, lstsq):
    """7c's correction: the observable with the largest |Spearman| with m (cell 000), its least-squares line."""
    ms = [r["cells"][CELL]["m"] for r in rows]
    best = max(obs_names, key=lambda o: abs(spearman([r[o] for r in rows], ms)))
    c0, c1 = lstsq([[1.0, r[best]] for r in rows], ms)
    return best, c0, c1


def policy():
    H = _mod("fresh7h_run", EXP / "fresh7h" / "run.py")
    DC = H.G7._deps()[1]
    old = json.loads((EXP / "drift7c" / "rows.json").read_text())
    rs = H.load_all()
    by = lambda st, p: [r for r in rs if r["set"] == st and r["pool"] == p]
    out = {}
    for name, pools in (("replay7h", H.TRAIN_POOLS), ("deploy", H.ALL_POOLS)):
        sets = {}
        for st in SETS:
            obs, c0, c1 = fit_line([o for o in old if o["set"] == st], DC.OBS, DC.spearman, DC.lstsq)
            tp = [by(st, p) for p in pools]
            m, inner_ok = H.choose_margin(tp, "theta50")
            lab = H.PICK["theta50"]([r for p in tp for r in p], m)
            sets[st] = dict(obs=obs, c0=c0, c1=c1, theta=lab[2], K1=lab[1], margin=m, inner_ok=inner_ok,
                            pools=list(pools))
        out[name] = dict(rule="theta50: extend to cycle 50 when |c0 + c1 O - 1| >= theta (cell 000)", sets=sets)
    (HERE / "policy.json").write_text(json.dumps(out, indent=1) + "\n")
    for name, p in out.items():
        for st, s in p["sets"].items():
            print(name, st, s["obs"], f"theta {s['theta']:.4f}", f"margin {s['margin']}")


# ---------- bench ----------

def jobs():
    rows = [r for r in _load(EXP / "fresh7h" / "bench.jsonl") if r.get("ok")]
    rows.sort(key=lambda r: (SETS.index(r["cond"].split("@")[0]), r["j"]))
    return [(i, r["cond"], r["j"], r["x"]) for i, r in enumerate(rows)]


def child(mode, c, x):
    t = time.perf_counter()
    if mode == "A":
        out = L7.child("A", c, x)
    else:
        try:
            out = dict(mode="T", ok=True, error=None, **T.run_design(c, x, T.load_policy("replay7h")))
        except Exception as ex:
            out = dict(mode="T", ok=False, error=f"{type(ex).__name__}: {str(ex)[:160]}")
    out["proc_s"] = time.perf_counter() - t
    return out


def _run(mode, c, x):
    t = time.perf_counter()
    p = subprocess.run([sys.executable, __file__, "child", mode, json.dumps([c, x])], capture_output=True, text=True,
                       timeout=2400)
    if p.returncode == 0 and p.stdout.strip():
        r = json.loads(p.stdout.strip().splitlines()[-1])
    else:
        r = dict(mode=mode, ok=False, error=f"exit {p.returncode}: {p.stderr.strip()[-160:]}")
    r["wall_s"] = time.perf_counter() - t
    return r


def order(i):
    return ["T", "A"] if i % 2 == 0 else ["A", "T"]


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in jobs() if (jb[1], jb[2]) not in done]
    print(f"{len(todo)} designs to go", flush=True)

    def one(job):
        i, c, j, x = job
        st = {m: _run(m, c, x) for m in order(i)}
        return dict(cond=c, j=j, x=x, order=order(i), ok=all(s["ok"] for s in st.values()), stages=st)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            s = r["stages"]
            print(r["cond"], r["j"], "ok" if r["ok"] else [v.get("error") for v in s.values()],
                  s["T"].get("extend"), {m: round(v.get("seconds") or -1, 2) for m, v in s.items()}, flush=True)


# ---------- report (stdlib) ----------

def rel(a, b):
    return abs(a - b) / abs(b) if b else abs(a - b)


def predicted_ratio(c, f):
    """Cycle model of the wall time, runner over U50: (c + 10 + 40 f) / (c + 50), c the fixed cost in cycles."""
    return (c + T.LOOK + (T.FULL - T.LOOK) * f) / (c + T.FULL)


def design_row(r, off, ref):
    t, a = r["stages"]["T"], r["stages"]["A"]
    o = off["cells"][CELL]
    s_off = abs(o["mC"] - 1)
    row = dict(cond=r["cond"], j=r["j"], set=r["cond"].split("@")[0], pick=t["pick"], extend=t["extend"],
               score=t["score"], score_off=s_off, theta=t["theta"], score_rel=rel(t["score"], s_off),
               obs_rel=rel(t["obs"][t["pick"]], off[t["pick"]]), extend_off=s_off >= t["theta"],
               near=abs(s_off - t["theta"]) <= BAND * t["theta"], tT=t["seconds"], tA=a["seconds"],
               t_look=t["t_look"], t_score=t["t_score"], cycles=t["cycles"],
               lost_rel_ref=rel(t["lost_mol"][-1], ref["lost_mol"][t["cycles"] - 1]))
    row["ratio"] = row["tT"] / row["tA"]
    if t["extend"]:
        b = (row["tA"] - row["t_look"]) / (T.FULL - T.LOOK)
        row["b"] = b if b > 0 else None
    else:
        row["b"] = None
    return row


def summarise(R):
    ext = [r for r in R if r["extend"]]
    ok = [r for r in ext if r["b"]]
    c = statistics.median((r["t_look"] - T.LOOK * r["b"]) / r["b"] for r in ok)
    f = len(ext) / len(R)
    # scoring overhead in cycles of the design's own b; for stopped designs b from the set's extended designs
    bset = {st: statistics.median([r["b"] for r in ok if r["set"] == st] or [r["b"] for r in ok]) for st in SETS}
    ovh = [r["t_score"] / (r["b"] or bset[r["set"]]) for r in R]
    return dict(n=len(R), flagged=len(ext), f=f, c=c, pred=predicted_ratio(c, f),
                ratio_mean=statistics.mean(r["ratio"] for r in R),
                ratio_total=sum(r["tT"] for r in R) / sum(r["tA"] for r in R),
                ovh_med=statistics.median(ovh), ovh_max=max(ovh),
                ratio_ext=statistics.median(r["ratio"] for r in ext) if ext else None,
                ratio_stop=statistics.median(r["ratio"] for r in R if not r["extend"]) if len(ext) < len(R) else None)


def verdicts(R, S):
    far = [r for r in R if not r["near"]]
    agree = sum(r["extend"] == r["extend_off"] for r in far)
    srel = [r["score_rel"] for r in R]
    d = abs(S["ratio_mean"] - S["pred"])
    return {
        "H297": dict(median_rel=statistics.median(srel), max_rel=max(srel), n_far=len(far), agree=agree,
                     n_near=len(R) - len(far), agree_near=sum(r["extend"] == r["extend_off"] for r in R if r["near"]),
                     verdict=verdict(agree == len(far) and statistics.median(srel) <= 1e-6 and max(srel) <= 1e-3,
                                     agree < len(far))),
        "H298": dict(pred=S["pred"], mean_ratio=S["ratio_mean"], gap=d, verdict=verdict(d <= 0.05, d > 0.10)),
        "H299": dict(median_cyc=S["ovh_med"], max_cyc=S["ovh_max"], verdict=verdict(S["ovh_med"] <= 0.5,
                                                                                      S["ovh_med"] > 2)),
        "H300": dict(saving=1 - S["ratio_mean"], verdict=verdict(1 - S["ratio_mean"] >= 0.10,
                                                                 1 - S["ratio_mean"] < 0.05)),
    }


def report():
    runs = [r for r in _load(HERE / "bench.jsonl") if r.get("ok")]
    off = {(o["cond"], o["j"]): o for o in json.loads((EXP / "fresh7h" / "rows.json").read_text())}
    ref = {(r["cond"], r["j"]): r for r in _load(EXP / "fresh7h" / "bench.jsonl") if r.get("ok")}
    R = [design_row(r, off[(r["cond"], r["j"])], ref[(r["cond"], r["j"])]) for r in runs]
    R.sort(key=lambda r: (SETS.index(r["set"]), r["j"]))
    S = summarise(R)
    per = {st: summarise([r for r in R if r["set"] == st]) if any(r["extend"] for r in R if r["set"] == st) else
           dict(n=sum(r["set"] == st for r in R), flagged=0,
                ratio_mean=statistics.mean(r["ratio"] for r in R if r["set"] == st)) for st in SETS}
    V = verdicts(R, S)
    L = ["cell-fidelity milestone 7m: the triage runner (one live Simulation per design; score at cycle 10; stop or",
         "extend in place to 50) on the 64 designs of the 7h pool, policy replay7h (picked without 7h). A: a fresh",
         "50-cycle run of the same design, lean recorder. PyBaMM 26.10.1.1, OMP_NUM_THREADS=1, shared container.", "",
         f"{'set':<12}{'j':>4}{'obs':>4}{'S runner':>10}{'S 7h':>10}{'theta':>8}{'ext':>5}{'7h':>4}"
         f"{'tT':>7}{'tA':>7}{'T/A':>7}{'score s':>9}{'dLi':>10}"]
    for r in R:
        L.append(f"{r['set']:<12}{r['j']:>4}{r['pick']:>4}{r['score']:>10.5f}{r['score_off']:>10.5f}{r['theta']:>8.4f}"
                 f"{'y' if r['extend'] else 'n':>5}{'y' if r['extend_off'] else 'n':>4}{r['tT']:>7.2f}{r['tA']:>7.2f}"
                 f"{r['ratio']:>7.3f}{r['t_score']:>9.3f}{r['lost_rel_ref']:>10.2e}" + ("  near theta" if r["near"] else ""))
    L += ["(S: drift score |m_hat - 1|; ext: runner extended to 50; 7h: offline decision; dLi: runner's last-cycle",
          " total lithium lost against the 7h bench's same cycle)", ""]
    L.append(f"{'set':<12}{'n':>4}{'flagged':>9}{'mean T/A':>10}")
    for st in SETS:
        p = per[st]
        L.append(f"{st:<12}{p['n']:>4}{p['flagged']:>9}{p['ratio_mean']:>10.3f}")
    L.append(f"{'all':<12}{S['n']:>4}{S['flagged']:>9}{S['ratio_mean']:>10.3f}")
    L += ["", f"fixed cost c (extended designs, median a/b): {S['c']:.2f} cycles; flagged share f = {S['f']:.3f}",
          f"T/A: mean {S['ratio_mean']:.3f}, total-time {S['ratio_total']:.3f}; extended median {S['ratio_ext']:.3f}"
          + (f", stopped median {S['ratio_stop']:.3f}" if S["ratio_stop"] is not None else ""), ""]
    h = V["H297"]
    L.append(f"H297 (the runner reproduces the offline triage): score rel diff median {h['median_rel']:.2e}, max "
             f"{h['max_rel']:.2e}; decisions agree on {h['agree']} of {h['n_far']} away from theta "
             f"({h['agree_near']} of {h['n_near']} within 1% of theta) -> {h['verdict']}")
    h = V["H298"]
    L.append(f"H298 (wall time follows the decision): predicted T/A {h['pred']:.3f}, measured mean {h['mean_ratio']:.3f}"
             f" (gap {h['gap']:.3f}) -> {h['verdict']}")
    h = V["H299"]
    L.append(f"H299 (scoring is cheap): median {h['median_cyc']:.3f} cycle equivalents (max {h['max_cyc']:.3f}) -> "
             f"{h['verdict']}")
    h = V["H300"]
    L.append(f"H300 (the runner saves wall time on a pool the policy never saw): {100 * h['saving']:.1f}% of U50 -> "
             f"{h['verdict']}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps({"verdicts": V, "summary": S, "per_set": per, "rows": R},
                                                  indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        c, x = json.loads(sys.argv[3])
        print(json.dumps(child(sys.argv[2], c, x)))
    else:
        {"policy": policy, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "bench"]()
