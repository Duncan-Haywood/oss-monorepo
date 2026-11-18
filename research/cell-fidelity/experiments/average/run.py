"""Milestone 3, part 2a: an average-case (independent-noise) model of screen-then-verify cost.

    python experiments/average/run.py     # -> results.txt, summary.json (about a minute)

No PyBaMM runs: reads ../cycles/bench.jsonl, ../cycles/cost.json and ../search/summary.json. The proposition is in
../../THEORY.md ("Part 2a"); the plan and H15 to H17 were fixed in ../../LOG.md (2026-11-12) before this ran.
Needs numpy and scipy.
"""
import importlib.util
import json
import random
from pathlib import Path

HERE = Path(__file__).resolve().parent
EXP = HERE.parent

TOL = 0.01
N_SEEDS, POOL = 30, 64
SWEEP = (16, 32, 64, 96)
SWEEP_SCREENS = (("SPM", 2), ("SPM", 100), ("DFN", 2), ("DFN", 10))
TARGET = ("DFN", 100)
MC = 2000            # Monte Carlo draws per pool (model B) and simulated pools per N (H16)


def _mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


th = _mod("theory_run", EXP / "theory" / "run.py")


def affine_residual(svals, fvals):
    """Least-squares fit f ~ a s + b; returns a, b and the residuals e = f - (a s + b)."""
    import numpy as np
    s = np.asarray(svals, float)
    f = np.asarray(fvals, float)
    a, b = np.polyfit(s, f, 1)
    return float(a), float(b), f - (a * s + b)


def expected_calls_gauss(fvals, sigma, tau=TOL, grid=4001):
    """Proposition: E[R] = 1 + sum_{x not in T} P(f_x + e_x > max_{y in T} f_y + e_y), e iid N(0, sigma^2).

    Each probability is the integral of phi((t - f_x)/sigma)/sigma * prod_{y in T} Phi((t - f_y)/sigma) dt,
    done on one grid for all x. sigma = 0 returns the exact noiseless count (1 when ties are absent)."""
    import numpy as np
    from scipy.stats import norm
    f = np.asarray(fvals, float)
    thr = (1 - tau) * f.max()
    inT = f >= thr
    if sigma <= 0:
        return 1.0 + float(np.sum(f[~inT] > f[inT].max()))
    t = np.linspace(f.min() - 8 * sigma, f.max() + 8 * sigma, grid)
    logF = norm.logcdf((t[:, None] - f[inT][None, :]) / sigma).sum(axis=1)   # log P(max_T <= t)
    Fmax = np.exp(logF)
    dens = norm.pdf((t[:, None] - f[~inT][None, :]) / sigma) / sigma          # density of each outsider
    p = np.trapezoid(dens * Fmax[:, None], t, axis=0)
    return 1.0 + float(np.clip(p, 0, 1).sum())


def calls_sim(fvals, noise, tau=TOL):
    """R for one noisy screen s' = f + noise (descending s', first design within tolerance)."""
    import numpy as np
    f = np.asarray(fvals, float)
    order = np.argsort(-(f + noise), kind="stable")
    thr = (1 - tau) * f.max()
    return int(np.argmax(f[order] >= thr)) + 1


def expected_calls_boot(fvals, resid, rng, draws=MC, tau=TOL):
    """Model B: e drawn with replacement from the cell's own residuals, independent of the design."""
    import numpy as np
    f = np.asarray(fvals, float)
    E = rng.choice(resid, size=(draws, len(f)), replace=True)
    return float(np.mean([calls_sim(f, E[k], tau) for k in range(draws)]))


def main():
    import numpy as np
    from scipy.stats import spearmanr
    cr = _mod("cycles_run", EXP / "cycles" / "run.py")
    js, runs, sc = cr.load()
    N = len(js)
    idx = list(range(N))
    f = np.array(sc[TARGET], float)
    c = json.loads((EXP / "cycles" / "cost.json").read_text())
    cost = {(m, int(n)): sorted(v)[1] for m, d in c.items() for n, v in d.items()}
    c_h = cost[TARGET]
    cells = [(m, n) for m in cr.MODELS for n in cr.NS if (m, n) != TARGET]
    pools = [random.Random(s).sample(range(N), POOL) for s in range(N_SEEDS)]
    rng = np.random.default_rng(0)

    L = ["cell-fidelity milestone 3 (theory, part 2a): an average-case noise model of screen-then-verify cost",
         f"benchmark: {N} Sobol designs; target DFN@100; tau = {TOL}; pools: {N_SEEDS} of {POOL} (milestone 4's)",
         "residual e = f - (a s + b), least squares over the 128; G: Gaussian e, sigma = RMS(e) (exact E[R] by quadrature);",
         f"B: e resampled from the cell's own 128 residuals independently of the design ({MC} draws a pool)", "",
         "A. per screen cell, pools of 64: observed mean R against the two independent-noise models",
         f"{'cell':<10} {'sigma':>6} {'sig_q':>6} {'sig_rob':>7} {'rho(e,f)':>8} {'R obs':>6} {'R G':>6} {'G/obs':>6} "
         f"{'R G_q':>6} {'R G_rob':>7} {'R B':>6} {'B/obs':>6}"]
    summ = dict(n=N, tau=TOL, pools=N_SEEDS, pool=POOL, cells={})
    for cell in cells:
        s = np.array(sc[cell], float)
        a, b, e = affine_residual(s, f)
        sigma = float(np.sqrt(np.mean(e ** 2)))
        S, _ = th.top_set(idx, list(s), list(f))
        _, _, eq = affine_residual(s[S], f[S])
        sig_q = float(np.sqrt(np.mean(eq ** 2)))
        sig_r = float(1.4826 * np.median(np.abs(e - np.median(e))))
        rho_ef = float(spearmanr(e, f).statistic)
        obs, G, Gq, Gr, B = [], [], [], [], []
        for pool in pools:
            fp = f[pool]
            obs.append(th.calls_to_target(pool, list(s), list(f)))
            G.append(expected_calls_gauss(fp, sigma))
            Gq.append(expected_calls_gauss(fp, sig_q))
            Gr.append(expected_calls_gauss(fp, sig_r))
            B.append(expected_calls_boot(fp, e, rng))
        k = f"{cell[0]}@{cell[1]}"
        row = dict(a=a, b=b, sigma=sigma, sigma_q=sig_q, sigma_robust=sig_r, rho_e_f=rho_ef,
                   R_obs_mean=float(np.mean(obs)), R_obs_median=float(np.median(obs)),
                   R_G=float(np.mean(G)), R_Gq=float(np.mean(Gq)), R_Grob=float(np.mean(Gr)), R_B=float(np.mean(B)))
        summ["cells"][k] = row
        L.append(f"{k:<10} {sigma:6.2f} {sig_q:6.2f} {sig_r:7.2f} {rho_ef:+8.2f} {row['R_obs_mean']:6.2f} {row['R_G']:6.2f} "
                 f"{row['R_G'] / row['R_obs_mean']:6.2f} {row['R_Gq']:6.2f} {row['R_Grob']:7.2f} {row['R_B']:6.2f} "
                 f"{row['R_B'] / row['R_obs_mean']:6.2f}")

    C = summ["cells"]
    keys = list(C)
    obs_m = [C[k]["R_obs_mean"] for k in keys]

    def fit(model):
        rho = float(spearmanr([C[k][model] for k in keys], obs_m).statistic)
        w2 = sum(1 for k in keys if 0.5 <= C[k][model] / C[k]["R_obs_mean"] <= 2)
        return rho, w2

    rho_G, w2_G = fit("R_G")
    h15 = "supported" if rho_G >= 0.8 and w2_G >= 8 else ("refuted" if rho_G < 0.6 or w2_G < 6 else "neither")
    extra = {m: fit(m) for m in ("R_Gq", "R_Grob", "R_B")}
    L += ["", "B. hypotheses",
          f"H15 model G over {len(keys)} cells: Spearman(E[R], observed mean R) {rho_G:.3f}, within a factor of 2 on "
          f"{w2_G} of {len(keys)} -> {h15}",
          "    extras (no verdict): " + "; ".join(f"{m[2:]} Spearman {r:.3f}, within 2x {w} of {len(keys)}"
                                                for m, (r, w) in extra.items())]
    summ["h15"] = dict(rho=rho_G, within2=w2_G, verdict=h15, extras={m: dict(rho=r, within2=w) for m, (r, w) in extra.items()})

    # H17
    sp = C["SPMe@100"]
    rB = sp["R_B"] / sp["R_obs_mean"]
    others = ["SPM@100"] + [k for k in keys if k.startswith("DFN")]
    ok_others = all(0.5 <= C[k]["R_B"] / C[k]["R_obs_mean"] <= 2 for k in others)
    h17 = ("supported" if rB <= 0.5 and ok_others else
           "refuted" if 1 / 1.5 <= rB <= 1.5 else "neither")
    L.append(f"H17 model B / observed mean R: SPMe@100 {rB:.2f}; SPM@100 and DFN cells all within 2x: {ok_others} "
             f"({', '.join(f'{k} {C[k]['R_B'] / C[k]['R_obs_mean']:.2f}' for k in others)}) -> {h17}")
    summ["h17"] = dict(ratio_spme=rB, others_within2=ok_others, verdict=h17)

    # H16: planning on simulated pools of N from the 128, against GP-EI's observed median T1 at each N
    ms = json.loads((EXP / "search" / "summary.json").read_text())
    sweep = ms["pool_sweep"]
    m_gp = ms["methods"]["GP-EI DFN@100"]["dfn_calls_median"]
    right = right_fixed = 0
    rows = []
    L += ["", "C. H16: predicted median T1 = N c_s + c_h median R (R simulated under G on "
          f"{MC} pools of N from the 128) against GP-EI's observed median T1",
          f"{'screen':<10} " + " ".join(f"{'N=' + str(P) + ' pred s/obs s':>20}" for P in SWEEP)]
    for cell in SWEEP_SCREENS:
        k = f"{cell[0]}@{cell[1]}"
        sigma = C[k]["sigma"]
        c_s = cost[cell]
        cols = []
        for P in SWEEP:
            Rsim = [calls_sim(f[rng.choice(N, P, replace=False)], rng.normal(0, sigma, P)) for _ in range(MC)]
            pred_t1 = P * c_s + c_h * float(np.median(Rsim))
            obs_t1 = sweep[str(P)][f"screen {k}"]
            gp = sweep[str(P)]["GP-EI DFN@100"]
            pred, obs = pred_t1 < gp, obs_t1 < gp
            right += pred == obs
            right_fixed += (pred_t1 < m_gp * c_h) == (obs_t1 < m_gp * c_h)
            rows.append(dict(cell=k, pool=P, pred_t1=pred_t1, obs_t1=obs_t1, gp_t1=gp, pred_win=pred, obs_win=obs))
            cols.append(f"{pred_t1:7.0f}/{obs_t1:5.0f} {('W' if pred else 'L') + '/' + ('W' if obs else 'L'):>5}")
        L.append(f"{k:<10} " + " ".join(f"{x:>20}" for x in cols))
    tot = len(SWEEP_SCREENS) * len(SWEEP)
    h16 = "supported" if right >= 13 else ("refuted" if right <= 10 else "neither")
    err = [abs(r["pred_t1"] - r["obs_t1"]) / r["obs_t1"] for r in rows]
    L.append("GP-EI observed median T1: " + ", ".join(f"N={P} {sweep[str(P)]['GP-EI DFN@100']:.0f} s" for P in SWEEP))
    L.append(f"H16 calls right: {right} of {tot} (against H14's fixed {m_gp * c_h:.1f} s: {right_fixed} of {tot}); "
             f"median |pred - obs| / obs {np.median(err):.2f} -> {h16}")
    summ["h16"] = dict(right=right, of=tot, right_fixed=right_fixed, median_rel_err=float(np.median(err)),
                       verdict=h16, rows=rows)

    (HERE / "results.txt").write_text("\n".join(L) + "\n")
    (HERE / "summary.json").write_text(json.dumps(summ, indent=1) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
