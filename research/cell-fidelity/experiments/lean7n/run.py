"""Milestone 7n: the triage runner with a lean score read, replayed on the 64 designs of the 7h pool.

    WORKERS=3 OMP_NUM_THREADS=1 python experiments/lean7n/run.py bench   # per design: T (lean runner) and A (pybamm)
    python experiments/lean7n/run.py report                              # H301 to H304 -> results.txt, summary.json

7m's runner reproduced the offline triage and saved 14.0% of wall time per design, but reading the drift score cost a
median 1.26 cycle equivalents. `triage.py` here reads only the picked observable, from the dead-lithium state at
cycle boundaries. The bench is 7m's (same designs, policy "replay7h", T and A each in its own process, order
alternated by design); T also reads 7m's full observables from its look solution after the timed run, for a paired
check. Plan in ../../LOG.md (7n plan).
"""
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
sys.path.insert(0, str(HERE))
N = __import__("triage")
M7 = N._mod("runner7m_run", EXP / "runner7m" / "run.py")
L7 = M7.L7
SETS, verdict, BAND, rel = M7.SETS, M7.verdict, M7.BAND, M7.rel
WORKERS = int(os.environ.get("WORKERS", "3"))
_load = M7._load


def child(mode, c, x):
    t = time.perf_counter()
    if mode == "A":
        out = L7.child("A", c, x)
    else:
        try:
            out = dict(mode="T", ok=True, error=None, **N.run_design(c, x, N.load_policy("replay7h"), compare=True))
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


def bench():
    path = HERE / "bench.jsonl"
    done = {(r["cond"], r["j"]) for r in _load(path) if r.get("ok")} if path.exists() else set()
    todo = [jb for jb in M7.jobs() if (jb[1], jb[2]) not in done]
    print(f"{len(todo)} designs to go", flush=True)

    def one(job):
        i, c, j, x = job
        st = {m: _run(m, c, x) for m in M7.order(i)}
        return dict(cond=c, j=j, x=x, order=M7.order(i), ok=all(s["ok"] for s in st.values()), stages=st)
    with ThreadPoolExecutor(WORKERS) as ex, path.open("a") as fh:
        for r in ex.map(one, todo):
            fh.write(json.dumps(r) + "\n")
            fh.flush()
            s = r["stages"]
            print(r["cond"], r["j"], "ok" if r["ok"] else [v.get("error") for v in s.values()], s["T"].get("extend"),
                  {m: round(v.get("seconds") or -1, 2) for m, v in s.items()}, flush=True)


# ---------- report (stdlib) ----------

def design_row(r, prev, ref):
    """One design: this bench's T and A, against 7m's runner on the same design (prev) and 7h's run (ref)."""
    t, a, p = r["stages"]["T"], r["stages"]["A"], prev["stages"]["T"]
    k = t["pick"]
    row = dict(cond=r["cond"], j=r["j"], set=r["cond"].split("@")[0], pick=k, extend=t["extend"], score=t["score"],
               score_7m=p["score"], theta=t["theta"], score_rel=rel(t["score"], p["score"]),
               obs_rel=rel(t["obs"][k], p["obs"][k]), paired_rel=rel(t["score_full"], p["score"]),
               extend_7m=p["extend"], near=abs(p["score"] - t["theta"]) <= BAND * t["theta"],
               tT=t["seconds"], tA=a["seconds"], t_look=t["t_look"], t_score=t["t_score"],
               t_score_7m=p["t_score"], t_score_full=t["t_score_full"], cycles=t["cycles"],
               lost_rel_ref=rel(t["lost_mol"][-1], ref["lost_mol"][t["cycles"] - 1]), mesh_vs_xn=t["mesh_vs_xn"])
    row["ratio"] = row["tT"] / row["tA"]
    b = (row["tA"] - row["t_look"]) / (N.FULL - N.LOOK) if t["extend"] else None
    row["b"] = b if b and b > 0 else None
    return row


def summarise(R):
    ext = [r for r in R if r["extend"]]
    ok = [r for r in ext if r["b"]]
    c = statistics.median((r["t_look"] - N.LOOK * r["b"]) / r["b"] for r in ok)
    f = len(ext) / len(R)
    bset = {st: statistics.median([r["b"] for r in ok if r["set"] == st] or [r["b"] for r in ok]) for st in SETS}
    ovh = [r["t_score"] / (r["b"] or bset[r["set"]]) for r in R]
    ovh7 = [r["t_score_7m"] / (r["b"] or bset[r["set"]]) for r in R]
    return dict(n=len(R), flagged=len(ext), f=f, c=c, pred=M7.predicted_ratio(c, f),
                ratio_mean=statistics.mean(r["ratio"] for r in R),
                ratio_total=sum(r["tT"] for r in R) / sum(r["tA"] for r in R),
                ovh_med=statistics.median(ovh), ovh_max=max(ovh), ovh7_med=statistics.median(ovh7),
                t_score_med=statistics.median(r["t_score"] for r in R),
                t_score_7m_med=statistics.median(r["t_score_7m"] for r in R),
                ratio_ext=statistics.median(r["ratio"] for r in ext) if ext else None,
                ratio_stop=statistics.median(r["ratio"] for r in R if not r["extend"]) if len(ext) < len(R) else None)


def verdicts(R, S, saving_7m):
    far = [r for r in R if not r["near"]]
    agree = sum(r["extend"] == r["extend_7m"] for r in far)
    srel = [r["score_rel"] for r in R]
    sav = 1 - S["ratio_mean"]
    d = abs(S["ratio_mean"] - S["pred"])
    return {
        "H301": dict(median_rel=statistics.median(srel), max_rel=max(srel), n_far=len(far), agree=agree,
                     n_near=len(R) - len(far), agree_near=sum(r["extend"] == r["extend_7m"] for r in R if r["near"]),
                     verdict=verdict(agree == len(far) and statistics.median(srel) <= 1e-3 and max(srel) <= 1e-2,
                                     agree < len(far))),
        "H302": dict(median_cyc=S["ovh_med"], max_cyc=S["ovh_max"], median_cyc_7m=S["ovh7_med"],
                     verdict=verdict(S["ovh_med"] <= 0.2, S["ovh_med"] > 0.5)),
        "H303": dict(saving=sav, saving_7m=saving_7m, verdict=verdict(sav >= 0.16, sav < saving_7m)),
        "H304": dict(pred=S["pred"], mean_ratio=S["ratio_mean"], gap=d, verdict=verdict(d <= 0.02, d > 0.04)),
    }


def report():
    runs = [r for r in _load(HERE / "bench.jsonl") if r.get("ok")]
    prev = {(r["cond"], r["j"]): r for r in _load(EXP / "runner7m" / "bench.jsonl") if r.get("ok")}
    ref = {(r["cond"], r["j"]): r for r in _load(EXP / "fresh7h" / "bench.jsonl") if r.get("ok")}
    s7 = json.loads((EXP / "runner7m" / "summary.json").read_text())["summary"]
    R = [design_row(r, prev[(r["cond"], r["j"])], ref[(r["cond"], r["j"])]) for r in runs]
    R.sort(key=lambda r: (SETS.index(r["set"]), r["j"]))
    S = summarise(R)
    per = {}
    for st in SETS:
        Rs = [r for r in R if r["set"] == st]
        per[st] = dict(n=len(Rs), flagged=sum(r["extend"] for r in Rs), ratio_mean=statistics.mean(r["ratio"] for r in Rs),
                       t_score_med=statistics.median(r["t_score"] for r in Rs),
                       t_score_7m_med=statistics.median(r["t_score_7m"] for r in Rs))
    V = verdicts(R, S, 1 - s7["ratio_mean"])
    L = ["cell-fidelity milestone 7n: the triage runner with a lean score read (picked observable only, plating from",
         "the dead-lithium state at cycle boundaries) on the 64 designs of the 7h pool, policy replay7h. A: a fresh",
         "50-cycle run of the same design, lean recorder. PyBaMM 26.10.1.1, OMP_NUM_THREADS=1, shared container.", "",
         f"{'set':<12}{'j':>4}{'obs':>4}{'S lean':>10}{'S 7m':>10}{'rel':>9}{'theta':>8}{'ext':>4}{'7m':>3}"
         f"{'tT':>7}{'tA':>7}{'T/A':>7}{'read s':>8}{'7m s':>7}"]
    for r in R:
        L.append(f"{r['set']:<12}{r['j']:>4}{r['pick']:>4}{r['score']:>10.5f}{r['score_7m']:>10.5f}{r['score_rel']:>9.1e}"
                 f"{r['theta']:>8.4f}{'y' if r['extend'] else 'n':>4}{'y' if r['extend_7m'] else 'n':>3}"
                 f"{r['tT']:>7.2f}{r['tA']:>7.2f}{r['ratio']:>7.3f}{r['t_score']:>8.4f}{r['t_score_7m']:>7.3f}"
                 + ("  near theta" if r["near"] else ""))
    L += ["(S: drift score |m_hat - 1|; rel: lean against 7m's runner score on the same design; ext: extended to 50;",
          " read s: this runner's score read, 7m s: 7m's on the same design in its own bench)", ""]
    L.append(f"{'set':<12}{'n':>4}{'flagged':>9}{'mean T/A':>10}{'read s':>9}{'7m s':>8}")
    for st in SETS:
        p = per[st]
        L.append(f"{st:<12}{p['n']:>4}{p['flagged']:>9}{p['ratio_mean']:>10.3f}{p['t_score_med']:>9.4f}"
                 f"{p['t_score_7m_med']:>8.3f}")
    L.append(f"{'all':<12}{S['n']:>4}{S['flagged']:>9}{S['ratio_mean']:>10.3f}{S['t_score_med']:>9.4f}"
             f"{S['t_score_7m_med']:>8.3f}")
    orel = [r["obs_rel"] for r in R]
    prel = [r["paired_rel"] for r in R]
    L += ["", f"fixed cost c (extended designs, median a/b): {S['c']:.2f} cycles; flagged share f = {S['f']:.3f}",
          f"T/A: mean {S['ratio_mean']:.3f}, total-time {S['ratio_total']:.3f}; extended median {S['ratio_ext']:.3f}"
          + (f", stopped median {S['ratio_stop']:.3f}" if S["ratio_stop"] is not None else ""),
          f"picked observable, lean against 7m: rel diff median {statistics.median(orel):.2e}, max {max(orel):.2e}",
          f"paired check (7m's read of this run's own look solution against 7m's score): median "
          f"{statistics.median(prel):.2e}, max {max(prel):.2e}; mesh nodes against x_n: max {max(r['mesh_vs_xn'] for r in R):.1e} m",
          f"in-process 7m read after the run (cache-warm, so a floor on its cost): median "
          f"{statistics.median(r['t_score_full'] for r in R):.4f} s", ""]
    h = V["H301"]
    L.append(f"H301 (the lean read keeps the decisions): score rel diff median {h['median_rel']:.2e}, max "
             f"{h['max_rel']:.2e}; decisions agree on {h['agree']} of {h['n_far']} away from theta "
             f"({h['agree_near']} of {h['n_near']} within 1% of theta) -> {h['verdict']}")
    h = V["H302"]
    L.append(f"H302 (the read is cheap): median {h['median_cyc']:.3f} cycle equivalents (max {h['max_cyc']:.3f}; 7m "
             f"{h['median_cyc_7m']:.3f} in this bench's b) -> {h['verdict']}")
    h = V["H303"]
    L.append(f"H303 (the saving rises): {100 * h['saving']:.1f}% of U50 (7m {100 * h['saving_7m']:.1f}%) -> "
             f"{h['verdict']}")
    h = V["H304"]
    L.append(f"H304 (the gap to the cycle model closes): predicted T/A {h['pred']:.3f}, measured mean "
             f"{h['mean_ratio']:.3f} (gap {h['gap']:.3f}) -> {h['verdict']}")
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps({"verdicts": V, "summary": S, "per_set": per, "rows": R},
                                                  indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "child":
        c, x = json.loads(sys.argv[3])
        print(json.dumps(child(sys.argv[2], c, x)))
    else:
        {"bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "bench"]()
