"""Milestone 5zg: does one plating exponent kappa per parameter set, calibrated on that set's earlier 100-cycle DFN runs,
fix the ten-cycle plating forecast on fresh designs at new currents? 5zf found the law needs a steeper potential lever on
LG M50 (oracle kappa* 30 to 57 /V, against alpha F / RT = 25.3) and about the physical one on Ai2020 and NCA_Kim2011, and
that kappa cannot be read from a design's own first ten cycles. A design search has earlier 100-cycle runs of the same
parameter set to hand, so it can calibrate kappa once per set.

    python experiments/setkappa/run.py dev              # seen: the 640 committed designs of 5zb to 5zf, leave-one-pool-out
    python experiments/setkappa/run.py tables           # balance tables of the fresh designs (pybamm, no simulation)
    WORKERS=3 python experiments/setkappa/run.py bench  # DFN (SEI + plating) to cycle 100 (5zc's simulate; resumable)
    python experiments/setkappa/run.py report           # H172 to H176 (stdlib) -> results.txt, summary.json

The law is 5zd's (experiments/kappa/run.py: tab, forecast, kappa_oracle), unchanged; only kappa moves. Three calibrations
of kappa per parameter set, each from the set's training designs (every design is a 100-cycle DFN run):
    med:  the median of the oracle kappa* over the training designs;
    err:  the kappa on a 0.25 /V grid over [0, KMAX] with the least median |ln(L_pred(99)/L_DFN(99))| over them;
    line: kappa* a least-squares line in the C-rate multiplier over them, read at the target current, clamped to [0, KMAX].
Plan and outcome in ../../LOG.md.
"""
import importlib.util
import json
import os
import statistics
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


KP = _mod("kappa_run", EXP / "kappa" / "run.py")
AS, CN, LD, SF, FL, S, B = KP.AS, KP.CN, KP.LD, KP.SF, KP.FL, KP.S, KP.B
K, TO, KAPPA, KMAX = KP.K, KP.TO, KP.KAPPA, KP.KMAX
spearman, line_fit, log_err = KP.spearman, KP.line_fit, KP.log_err

WORKERS = int(os.environ.get("WORKERS", "3"))
SOBOL_SEED = 25        # used by no milestone (5zf used 24)
N_LOG2 = 5             # 32 designs per pool
GSTEP = 0.25
GRID = [GSTEP * i for i in range(int(KMAX / GSTEP) + 1)]
# fixed before any run: one current per set that no milestone has used, inside each set's dev range; the LG M50
# currents sit at the low end, where the seen kappa* is highest, so the constant and the line calibrations part
CONDITIONS = ("Ai2020@0.5375x", "NCA_Kim2011@0.65625x", "Chen2020@1.265625x", "OKane2022@1.28125x")
CONTROLS, LGM50 = CONDITIONS[:2], CONDITIONS[2:]
FORMS = ("phys", "med", "err", "line")


# ---------- pure helpers (stdlib; tested) ----------

def pset(cond):
    return cond.split("@")[0]


def crate(cond):
    return float(cond.split("@")[1].rstrip("x"))


def design(b, f, short=None, k=K):
    """One design's kappa-free tables, its true cycle-99 loss and its oracle kappa*."""
    s = short or f
    lost = f["lost_mol"]
    eta = LD.eta_of(s["q_ch"], s["lost_mol"], b, k)
    t = KP.tab(lost, b, eta, k)
    lt = lost[TO - 2]
    return dict(t=t, lost=lost, l_true=lt, k_star=KP.kappa_oracle(t, lost, lt, k))


def err_at(d, kappa):
    """|ln(L_pred(99)/L_DFN(99))| at a given kappa (None if the forecast fails)."""
    p = KP.forecast(d["t"], d["lost"], kappa)
    return abs(log_err(p, d["l_true"])) if p else None


def errs_on_grid(d):
    return [err_at(d, x) for x in GRID]


def _med_err(train, i):
    v = [r["egrid"][i] for r in train if r["egrid"][i] is not None]
    return statistics.median(v) if v else float("inf")


def calibrate(train, c=None):
    """kappa per form from training rows (each with k_star, crate and egrid); c = the target C-rate for 'line'."""
    ks = [r["k_star"] for r in train]
    i = min(range(len(GRID)), key=lambda i: _med_err(train, i))
    out = dict(phys=KAPPA, med=statistics.median(ks), err=GRID[i])
    xs = [r["crate"] for r in train]
    if c is None or max(xs) - min(xs) <= 0:
        out["line"] = out["med"]
    else:
        a, s = line_fit(xs, ks)
        out["line"] = max(0.0, min(KMAX, a + s * c))
    return out


def score(rows, kappas):
    """Median |ln err| per form on rows, and the signed median."""
    out = {}
    for f, x in kappas.items():
        e = [err_at(r, x) for r in rows]
        e = [v for v in e if v is not None]
        out[f] = statistics.median(e) if e else None
    return out


# ---------- seen designs (5zb to 5zf) ----------

def _seen():
    yield from KP._seen()
    last = {}
    for f in B._load(EXP / "kappa" / "bench.jsonl"):
        last[(f["cond"], f["j"])] = f
    for _, f in sorted(last.items()):
        if AS._full(f) and len(f.get("q_ch", [])) >= K:
            yield "kappa", f, f


_BALS = {}


def _one(item):
    d, f, s = item
    if d not in _BALS:
        _BALS[d] = SF._bal(EXP / d)
    bal, ocp = _BALS[d]
    r = design(CN._b(bal, ocp, (f["cond"], f["j"])), f, s)
    r.update(pool=f"{d}/{f['cond']}", cond=f["cond"], set=pset(f["cond"]), crate=crate(f["cond"]), j=f["j"],
             egrid=errs_on_grid(r))
    return r


def _rows(items):
    import multiprocessing
    with multiprocessing.Pool(WORKERS) as pool:
        return list(pool.imap(_one, items, chunksize=4))


def lopo(rows):
    """Leave one pool out: each seen pool forecast with kappa calibrated on the same set's other pools."""
    pools = sorted({r["pool"] for r in rows})
    out = {}
    for p in pools:
        test = [r for r in rows if r["pool"] == p]
        st, c = test[0]["set"], test[0]["crate"]
        train = [r for r in rows if r["set"] == st and r["pool"] != p]
        ks = calibrate(train, c)
        out[p] = dict(n=len(test), kappa=ks, err=score(test, ks), k_star=statistics.median(r["k_star"] for r in test))
    return out


def _strip(r):
    return {k: v for k, v in r.items() if k not in ("t", "lost", "egrid")}


def dev():
    rows = _rows(list(_seen()))
    L = ["cell-fidelity milestone 5zg dev (seen): the 640 committed designs of 5zb to 5zf, 20 pools on four parameter",
         "sets. Leave one pool out: each pool forecast by 5zd's law with kappa calibrated on the same set's other four",
         "pools (128 designs). phys = alpha F / RT = 25.3 /V; med = median oracle kappa*; err = kappa with the least",
         "pooled median error; line = kappa* a line in the C-rate, read at the pool's current. Median |ln(L_pred(99) /",
         "L_DFN(99))| per pool; kappa in /V.", "",
         f"{'pool':34s}{'n':>4s}{'k*':>7s}{'k_med':>7s}{'k_err':>7s}{'k_line':>7s}"
         + "".join(f"{f:>7s}" for f in FORMS)]
    lo = lopo(rows)
    for p, d in lo.items():
        L.append(f"{p:34s}{d['n']:4d}{d['k_star']:7.1f}{d['kappa']['med']:7.1f}{d['kappa']['err']:7.1f}"
                 f"{d['kappa']['line']:7.1f}" + "".join(f"{d['err'][f]:7.3f}" for f in FORMS))
    L += ["", "Per form, pools won against phys (of 20) and worst pool:"]
    for f in FORMS[1:]:
        w = sum(d["err"][f] < d["err"]["phys"] for d in lo.values())
        L.append(f"  {f:5s} wins {w:2d}; worst {max(d['err'][f] for d in lo.values()):.3f} "
                 f"(phys worst {max(d['err']['phys'] for d in lo.values()):.3f})")
    full = {}
    L += ["", "Calibration on every seen design of each set (what the fresh bench will use), and line coefficients:"]
    for st in sorted({r["set"] for r in rows}):
        tr = [r for r in rows if r["set"] == st]
        full[st] = calibrate(tr)
        a, s = line_fit([r["crate"] for r in tr], [r["k_star"] for r in tr])
        full[st]["line_a"], full[st]["line_s"] = a, s
        L.append(f"  {st:12s} n {len(tr):3d}  med {full[st]['med']:.2f}  err {full[st]['err']:.2f}  "
                 f"line {a:+.1f} {s:+.1f} * c")
    (HERE / "dev.txt").write_text("\n".join(L) + "\n")
    (HERE / "dev.json").write_text(json.dumps(dict(lopo=lo, calibration=full), indent=1) + "\n")
    print("\n".join(L))


# ---------- fresh bench ----------

def tables():
    FL.HERE, FL.SOBOL_SEED, FL.CONDITIONS, FL.N_LOG2 = HERE, SOBOL_SEED, CONDITIONS, N_LOG2
    FL.tables()


def bench():
    LD.WORKERS = WORKERS
    path = HERE / "bench.jsonl"
    LD._run(LD._todo(path, B._load(HERE / "balance.jsonl")), path, TO)



def fresh_kappas(cal, cond):
    """The kappa per form for a fresh pool, from the full-seen calibration in dev.json (fixed in the plan)."""
    c = cal[pset(cond)]
    return dict(phys=KAPPA, med=c["med"], err=c["err"],
                line=max(0.0, min(KMAX, c["line_a"] + c["line_s"] * crate(cond))))


def verdicts(C):
    """H172 to H176, fixed in the plan (../../LOG.md, 5zg) after dev and before any fresh run."""
    e = {c: C[c]["err"] for c in C}
    lg = [e[c] for c in LGM50 if c in e]
    ctl = [e[c] for c in CONTROLS if c in e]
    w_med, w_phys = max(v["med"] for v in e.values()), max(v["phys"] for v in e.values())
    return dict(H172=S.verdict(all(v["med"] < v["phys"] for v in lg), not any(v["med"] < v["phys"] for v in lg)),
                H173=S.verdict(all(v["med"] <= 0.07 for v in lg), any(v["med"] > 0.10 for v in lg)),
                H174=S.verdict(all(v["med"] <= v["phys"] + 0.01 for v in ctl), any(v["med"] > v["phys"] + 0.03 for v in ctl)),
                H175=S.verdict(w_med < w_phys and w_med <= 0.08, w_med >= w_phys),
                H176=S.verdict(all(v["line"] < v["med"] for v in lg), all(v["line"] > v["med"] for v in lg)))


def report():
    cal = json.loads((HERE / "dev.json").read_text())["calibration"]
    bal, ocp = SF._bal(HERE)
    last = {}
    for f in B._load(HERE / "bench.jsonl"):   # readers keep the last record per design (memory kills are retried)
        last[(f["cond"], f["j"])] = f
    C, R = {}, {}
    for c in CONDITIONS:
        rows, dropped = [], 0
        for (cc, j), f in sorted(last.items()):
            if cc != c:
                continue
            if not AS._full(f) or len(f.get("q_ch", [])) < K:
                dropped += 1
                continue
            r = design(CN._b(bal, ocp, (c, j)), f)
            r["j"] = j
            rows.append(r)
        if not rows:
            continue
        ks = fresh_kappas(cal, c)
        sgn = {}
        for fm, x in ks.items():
            v = [log_err(p, r["l_true"]) for r in rows for p in [KP.forecast(r["t"], r["lost"], x)] if p]
            sgn[fm] = statistics.median(v)
        wins = sum((err_at(r, ks["med"]) or 9) < (err_at(r, KAPPA) or 9) for r in rows)
        kst = sorted(r["k_star"] for r in rows)
        q = lambda p: kst[min(len(kst) - 1, int(p * len(kst)))]
        C[c] = dict(n=len(rows), dropped=dropped, kappa=ks, err=score(rows, ks), sgn=sgn, wins_med=wins,
                    k_star=statistics.median(kst), k_star_q25=q(0.25), k_star_q75=q(0.75),
                    rho_med=spearman([KP.forecast(r["t"], r["lost"], ks["med"]) or 0 for r in rows],
                                     [r["l_true"] for r in rows]))
        R[c] = [_strip(r) | {f"l_{fm}": KP.forecast(r["t"], r["lost"], x) for fm, x in ks.items()} for r in rows]
    V = verdicts(C)
    L = ["cell-fidelity milestone 5zg: 5zd's eta-window law with kappa per parameter set, calibrated on the set's 160",
         "seen 100-cycle designs (5zb to 5zf): phys = 25.3 /V; med = median oracle kappa*; err = least pooled error;",
         f"line = kappa* a line in the C-rate. DFN (SEI + plating) to cycle 100, fresh Sobol designs (seed {SOBOL_SEED});",
         "median |ln(L_pred(99) / L_DFN(99))|; kappa in /V; k* = the fresh pool's own oracle median [q25, q75];",
         "wins = designs where med beats phys; rho = Spearman(med forecast, true loss)", "",
         f"{'condition':22s}{'n':>3s}{'drop':>5s}{'k_med':>7s}{'k_line':>7s}{'k*':>7s}{'[q25':>6s}{'q75]':>6s}"
         + "".join(f"{f:>7s}" for f in FORMS) + f"{'sgn phys':>9s}{'sgn med':>8s}{'wins':>5s}{'rho':>7s}"]
    for c, d in C.items():
        L.append(f"{c:22s}{d['n']:3d}{d['dropped']:5d}{d['kappa']['med']:7.1f}{d['kappa']['line']:7.1f}{d['k_star']:7.1f}"
                 f"{d['k_star_q25']:6.1f}{d['k_star_q75']:6.1f}" + "".join(f"{d['err'][f]:7.3f}" for f in FORMS)
                 + f"{d['sgn']['phys']:+9.3f}{d['sgn']['med']:+8.3f}{d['wins_med']:5d}{d['rho_med']:7.3f}")
    L += ["", f"H172 (med below phys on both LG M50 pools): {V['H172']}",
          f"H173 (med at most 0.07 on both LG M50 pools): {V['H173']}",
          f"H174 (med at most phys + 0.01 on both controls): {V['H174']}",
          f"H175 (med's worst pool below phys's worst and at most 0.08): {V['H175']}",
          f"H176 (line below med on both LG M50 pools): {V['H176']}"]
    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(dict(conditions=C, verdicts=V, rows=R), indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    {"dev": dev, "tables": tables, "bench": bench, "report": report}[sys.argv[1] if len(sys.argv) > 1 else "report"]()
