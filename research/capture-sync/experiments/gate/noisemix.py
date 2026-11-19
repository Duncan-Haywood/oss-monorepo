"""Step 3l: a real room's noise is partly heard by both devices and partly by one. How much of it must be
shared before it stops hurting, and does the envelope-normalised estimator (`fn`, step 3h) keep its lead?

    python experiments/gate/noisemix.py collect <MS-SNSD root> <windows_l.npz> [--procs 4] [--trials 1000]
    python experiments/gate/noisemix.py score <windows_l.npz>

Steps 3c-3k gave each device its own noise (independent) and step 3f gave both one source (shared); a rig
hears a mix. Here the noise at each device is

    n = sqrt(rho) * shared + sqrt(1 - rho) * independent,

each component scaled to that device's speech power at -10 dB before mixing, so the total stays at about
-10 dB window SNR and only the shared fraction rho of its power changes (rho = 0, 0.25, 0.5, 0.75, 0.9, 1).

Draws are step 3f's exactly, so both ends are replays:
  * the independent component is step 3c's -10 dB draw for that type (step 3c's random stream consumed for
    every one of its 31 conditions, so later trials draw the same numbers; GCC runs only where needed);
  * the shared component is step 3f's D = 3 m draw (its second generator, seeded by (seed, trial, 3):
    talker and source positions, one stretch of the type, a fresh impulse response per device).
So rho = 0 must equal step 3c's (plain, gamma 0.25) and step 3h's (`fn`) -10 dB cells against the speech
truth, and rho = 1 step 3f's shared 3 m cells against the clock truth. D = 3 m is inside step 3f's bound
(every common sound lands within D / c = 8.7 ms of the clock offset), so the shared part is never wrong by
itself; the question is how it interacts with the part that is not shared.

A one-line model to test: shared noise inside the bound is signal. With speech S and total noise 10 S,
the coherent power is S + 10 rho S and the incoherent 10 (1 - rho) S, an effective coherent SNR of
10 log10((1 + 10 rho) / (10 (1 - rho))): -10, -3.3, +0.8, +5.3 and +10 dB for rho = 0 to 0.9.

Per window: gamma 0.25 GCC (plain) and gamma 0.25 GCC on each device's audio divided by its own 32 ms RMS
envelope (`fn`, `sync.envelope_normalise`), delay and PSR, and the blind SNR estimate snr_hat. Errors are
kept against the speech truth; the clock truth adds the talker's path difference at 3 m (step 3f).
Gate: Mondrian-snr_hat LTT on `fn`'s PSR (alpha 1%, delta 0.1, step 3's grid), calibrated on sessions 0-4
at rho = 0 (all ten types, independent noise: what a rig sees if it calibrates with a noise source next to
each device) and tested on sessions 5-9 at each rho.
"""
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np
from scipy.signal import fftconvolve

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
import noisetype as NT  # noqa: E402
import noiseshared as NS  # noqa: E402
from capture_sync.sync import FS, gcc, envelope_normalise  # noqa: E402
from capture_sync.gate import blind_snr_db, mondrian_ltt, mondrian_accept  # noqa: E402

FRAME, PRIOR, SEARCH = NT.FRAME, NT.PRIOR, NT.SEARCH
ALPHA, DELTA, GRID = NT.ALPHA, NT.DELTA, NT.GRID
ROOMS, TYPES, CONDS = NT.ROOMS, NT.TYPES, NT.CONDS
L = 2.0
LI = NT.WINS.index(L)
D = 3.0
DI = NS.SEPS.index(D)
SNR = -10.0
RHOS = [0.0, 0.25, 0.5, 0.75, 0.9, 1.0]
IMPULSIVE = ["Munching", "Neighbor", "ShuttingDoor", "Typing"]
COLS = ["rt", "trial", "sess", "type", "rho", "snr_hat", "err", "psr", "err_fn", "psr_fn", "ds", "dn", "redraws"]
SCREEN = 0.3  # post hoc (LOG.md 3l): a shared stretch this correlated with a device's independent one is a copy
MAX_REDRAW = 50


def xpeak(x, y):
    """Peak |normalised cross-correlation| of two signals over all lags."""
    x = (x - x.mean()) / (np.linalg.norm(x - x.mean()) + 1e-20)
    y = (y - y.mean()) / (np.linalg.norm(y - y.mean()) + 1e-20)
    return float(np.max(np.abs(fftconvolve(x, y[::-1]))))


def eff_snr_db(rho, snr=SNR):
    """Coherent (speech + shared noise) over incoherent (independent noise) power, in dB."""
    s, nz = 1.0, 10 ** (-snr / 10)
    return 10 * np.log10((s + rho * nz) / max((1 - rho) * nz, 1e-12))


def mix(x0, s, ind, sh, rho):
    """Speech plus rho of shared and 1 - rho of independent noise power, each scaled to s at SNR."""
    scale = lambda z: z * np.sqrt(s / 10 ** (SNR / 10) / (np.mean(z ** 2) + 1e-20))  # noqa: E731
    return x0 + np.sqrt(rho) * scale(sh) + np.sqrt(1 - rho) * scale(ind)


def run_chunk(args):
    """Step 3l's windows. With screen=True (step 3l-b, written after the first score) a shared stretch whose
    raw recording matches either device's independent stretch (xpeak > SCREEN) is redrawn from a fourth
    generator seeded by (seed, trial, 4, type), up to MAX_REDRAW times; rho 0 is unchanged."""
    root, rt, L_, trials, seed = args[:5]
    screen = len(args) > 5 and args[5]
    rng = np.random.default_rng(seed)
    blocks, nz = NT.speech_blocks(root), NT.noises(root)
    pool = {t: np.concatenate(nz[t]) for t in TYPES[1:]}
    n, G = int(L_ * FS), int(SEARCH * FS)
    pad = int(rt * FS) + 1
    need = n + 2 * G + 2 * int(PRIOR * FS) + 2 * pad + 2
    rows = []
    for t in trials:
        rng3 = np.random.default_rng([seed, t, 3])
        us_pos, un_pos = NS.geometry(rng3)
        ds = [NS.path_diff_s(us_pos, Dd) for Dd in NS.SEPS]
        dn = [NS.path_diff_s(un_pos, Dd) for Dd in NS.SEPS]
        sess = t % NT.N_SESS
        sp = blocks[sess]
        i = int(rng.integers(0, len(sp) - need))
        seg = sp[i:i + need]
        xa = fftconvolve(seg, NT.rir(rt, rng))[:need]
        xb = fftconvolve(seg, NT.rir(rt, rng))[:need]
        p0 = pad + int(PRIOR * FS) + G
        us = int(round(rng.uniform(-PRIOR, PRIOR) * FS))
        a0 = xa[p0:p0 + n]
        b0 = xb[p0 + us - G:p0 + us - G + n + 2 * G]
        k_true = G - us
        sa = np.mean(a0 ** 2) + 1e-20
        sb = np.mean(b0[k_true:k_true + n] ** 2) + 1e-20
        ind = {}
        for ti, snr in CONDS:  # consume step 3c's stream exactly; keep the -10 dB draws
            if ti < 0:
                continue
            zz = []
            for dev, w in enumerate((a0, b0)):
                if TYPES[ti] == "white":
                    z = rng.standard_normal(len(w))
                else:
                    src = nz[TYPES[ti]][dev]
                    j = int(rng.integers(0, len(src) - len(w)))
                    z = src[j:j + len(w)].copy()
                zz.append(z)
            if snr == SNR:
                ind[ti] = zz
        nlen = need + 2 * NS.MARGIN
        for ti, tn in enumerate(TYPES):  # step 3f's shared draws, exactly
            if tn == "white":
                z = rng3.standard_normal(nlen)
            else:
                src = pool[tn]
                j = int(rng3.integers(0, len(src) - nlen))
                z = src[j:j + nlen].copy()
            ha, hb = NT.rir(rt, rng3), NT.rir(rt, rng3)
            redraws = 0
            if screen and tn != "white":
                rng4 = np.random.default_rng([seed, t, 4, ti])
                while redraws < MAX_REDRAW and max(xpeak(z, ind[ti][0]), xpeak(z, ind[ti][1])) > SCREEN:
                    j = int(rng4.integers(0, len(src) - nlen))
                    z = src[j:j + nlen].copy()
                    redraws += 1
            lag = int(round((dn[DI] - ds[DI]) * FS))
            na, nb = NS.shared_tracks(z, ha, hb, lag, need)
            za = na[p0:p0 + n]
            zb = nb[p0 + us - G:p0 + us - G + n + 2 * G]
            for rho in RHOS:
                a = mix(a0, sa, ind[ti][0], za, rho)
                b = mix(b0, sb, ind[ti][1], zb, rho)
                sh = min(blind_snr_db(a), blind_snr_db(b[G:G + n]))
                d, p = gcc(a, b, gamma=0.25, max_lag_s=SEARCH, centre_s=SEARCH)
                dfn, pfn = gcc(envelope_normalise(a), envelope_normalise(b), gamma=0.25, max_lag_s=SEARCH,
                               centre_s=SEARCH)
                rows.append([rt, t, sess, ti, rho, sh, d - k_true / FS, p, dfn - k_true / FS, pfn,
                             ds[DI], dn[DI], redraws])
    return rows


def collect(root, out, procs, n_trials=1000, screen=False):
    jobs = []
    for ri, rt in enumerate(ROOMS):
        for c in range(8):  # noisetype.collect's chunks and seeds for L = 2 s, exactly
            jobs.append((root, rt, L, list(range(c, n_trials, 8)), 31000 + 1000 * ri + 100 * LI + c, screen))
    with ProcessPoolExecutor(procs) as ex:
        rows = [r for rr in ex.map(run_chunk, jobs) for r in rr]
    np.savez_compressed(out, rows=np.array(rows, float))
    print(f"{len(rows)} windows -> {out}")


def loadrows(path):
    r = np.load(path)["rows"]
    d = {c: r[:, k] for k, c in enumerate(COLS) if k < r.shape[1]}
    d.setdefault("redraws", np.zeros(len(r)))
    for c in ("trial", "sess", "type"):
        d[c] = d[c].astype(int)
    return d


def spearman(x, y):
    rx, ry = np.argsort(np.argsort(x)), np.argsort(np.argsort(y))
    return float(np.corrcoef(rx, ry)[0, 1])


def score(path, tag=""):
    d = loadrows(path)
    out = []
    P = out.append
    clock = {"plain": np.abs(d["err"] + d["ds"]) > FRAME, "fn": np.abs(d["err_fn"] + d["ds"]) > FRAME}
    speech = {"plain": np.abs(d["err"]) > FRAME, "fn": np.abs(d["err_fn"]) > FRAME}
    summ = {"replay": {}, "fail": {}, "eff_snr_db": {str(r): float(eff_snr_db(r)) for r in RHOS},
            "lock": {}, "gate": {}, "tally": {}}
    P("capture-sync step 3l: noise partly shared (one source, devices 3 m apart, step 3f) and partly")
    P("independent (step 3c), total -10 dB window SNR; MS-SNSD speech and noise, statistical rooms, 2 s windows;")
    P("gamma 0.25 GCC (plain) and envelope-normalised (fn); errors against the clock truth at 30 fps")
    P(f"windows: {len(d['rho'])}")
    if tag:
        P(f"step 3l-b (screened): shared stretches redrawn when their recording matched a device's independent one "
          f"(peak normalised cross-correlation > {SCREEN}); windows with a redraw "
          f"{float(np.mean(d['redraws'][d['rho'] > 0] > 0)):.3f} of rho > 0, still unscreened after {MAX_REDRAW} "
          f"tries {int(np.sum(d['redraws'] >= MAX_REDRAW))}")
        summ["redraw_share"] = {f"{rt}|{tn}": float(np.mean(d["redraws"][(d["rt"] == rt) & (d["type"] == ti)
                                                                          & (d["rho"] == 1.0)] > 0))
                                for rt in ROOMS for ti, tn in enumerate(TYPES)}
    P("")
    # replays
    ref3c = json.load(open(os.path.join(HERE, "noisetype_summary.json")))["fail"]
    ref3h = json.load(open(os.path.join(HERE, "noiseimpulse_summary.json")))["fail"]
    ref3f = json.load(open(os.path.join(HERE, "noiseshared_summary.json")))["raw"]
    same = {"3c_plain": 0, "3h_fn": 0, "3f_plain": 0}
    for rt in ROOMS:
        for ti, tn in enumerate(TYPES):
            m0 = (d["rt"] == rt) & (d["type"] == ti) & (d["rho"] == 0.0)
            m1 = (d["rt"] == rt) & (d["type"] == ti) & (d["rho"] == 1.0)
            same["3c_plain"] += abs(speech["plain"][m0].mean() - ref3c[f"{rt}|{L}|{tn}|{SNR}"][1]) < 1e-12
            same["3h_fn"] += abs(speech["fn"][m0].mean() - ref3h[f"{rt}|{tn}|{SNR}"][1]) < 1e-12
            same["3f_plain"] += abs(clock["plain"][m1].mean() - ref3f[f"{rt}|0.25|{tn}|{D}|30|{SNR}"][1]) < 1e-12
    summ["replay"] = {k: [int(v), 2 * len(TYPES)] for k, v in same.items()}
    P("== Replay (cells of 20): rho 0 plain = step 3c {3c_plain}, rho 0 fn = step 3h {3h_fn}, "
      "rho 1 plain = step 3f (3 m) {3f_plain} ==".format(**{k: v[0] for k, v in summ["replay"].items()}))
    P("")
    P("== Raw failure share (clock truth, 30 fps), plain / fn, by shared fraction rho ==")
    P("   effective coherent SNR (dB): " + "  ".join(f"rho {r}: {eff_snr_db(r):+.1f}" for r in RHOS[:-1]))
    for rt in ROOMS:
        P(f"  RT60 {rt}")
        for ti, tn in enumerate(TYPES):
            cells = []
            for rho in RHOS:
                m = (d["rt"] == rt) & (d["type"] == ti) & (d["rho"] == rho)
                v = [float(clock["plain"][m].mean()), float(clock["fn"][m].mean())]
                summ["fail"][f"{rt}|{tn}|{rho}"] = v
                cells.append(f"{v[0]:.3f}/{v[1]:.3f}")
            m = (d["rt"] == rt) & (d["type"] == ti) & (d["rho"] == 1.0)
            for est, ek in (("plain", "err"), ("fn", "err_fn")):
                ec = d[ek][m] + d["ds"][m]
                summ["lock"][f"{rt}|{tn}|{est}"] = float(np.mean(np.abs(ec - d["dn"][m]) < 0.002))
            P(f"    {tn:21s} " + "  ".join(cells) +
              f"   lock@1 {summ['lock'][f'{rt}|{tn}|plain']:.2f}/{summ['lock'][f'{rt}|{tn}|fn']:.2f}")
    P("")
    # gate: fn's PSR, Mondrian on snr_hat, calibrate on rho 0 sessions 0-4, test each rho on sessions 5-9
    P("== Gate: fn's PSR, Mondrian-snr_hat LTT (alpha 1%, delta 0.1), calibrated on rho 0 (independent), "
      "sessions 0-4, all types; tested on sessions 5-9: kept / wrong among accepted ==")
    for rt in ROOMS:
        base = d["rt"] == rt
        cal = base & (d["sess"] < 5) & (d["rho"] == 0.0)
        floor, inner, lams = mondrian_ltt(d["psr_fn"][cal], clock["fn"][cal], d["snr_hat"][cal], GRID, ALPHA, DELTA)
        P(f"  RT60 {rt}")
        for rho in RHOS:
            te = base & (d["sess"] >= 5) & (d["rho"] == rho)
            acc = mondrian_accept(d["psr_fn"][te], d["snr_hat"][te], floor, inner, lams)
            nacc = int(acc.sum())
            pooled = [nacc / max(int(te.sum()), 1), float(clock["fn"][te][acc].mean()) if nacc else float("nan"), nacc]
            summ["gate"][f"{rt}|{rho}|pooled"] = pooled
            cells, ok = [], 0
            for ti, tn in enumerate(TYPES):
                tt = te & (d["type"] == ti)
                a2 = mondrian_accept(d["psr_fn"][tt], d["snr_hat"][tt], floor, inner, lams)
                na = int(a2.sum())
                v = [na / max(int(tt.sum()), 1), float(clock["fn"][tt][a2].mean()) if na else float("nan"), na]
                summ["gate"][f"{rt}|{rho}|{tn}"] = v
                ok += (na == 0) or (v[1] <= 0.02)
                cells.append(f"{tn[:6]} {v[0]:.2f} {'-' if na == 0 else f'{v[1]:.3f}'}")
            summ["gate"][f"{rt}|{rho}|ok"] = ok
            P(f"    rho {rho:4}: pooled kept {pooled[0]:.2f} wrong {pooled[1]:.4f}; types <= 2%: {ok}/10 | "
              + "; ".join(cells))
    P("")
    # tallies for the predictions
    P("== Tallies ==")
    ref0 = {}
    for rt in ROOMS:
        t = {}
        mono = 0
        for tn in TYPES:
            f = [summ["fail"][f"{rt}|{tn}|{r}"][0] for r in RHOS]
            mono += all(f[k + 1] <= f[k] + 0.01 for k in range(len(f) - 1))
        t["plain_monotone"] = mono
        # effective-SNR model: rho 0.5 (+0.8 dB) against step 3c's 0 dB independent; rho 0.9 (+10 dB) against +10 dB
        t["model_rho0.5_vs_0dB"] = sum(summ["fail"][f"{rt}|{tn}|0.5"][0] <= ref3c[f"{rt}|{L}|{tn}|0.0"][1] + 0.02
                                       for tn in TYPES)
        t["model_rho0.9_vs_10dB"] = sum(summ["fail"][f"{rt}|{tn}|0.9"][0] <= ref3c[f"{rt}|{L}|{tn}|10.0"][1] + 0.02
                                        for tn in TYPES)
        t["model_rho0.25_le_rho0_half"] = sum(summ["fail"][f"{rt}|{tn}|0.25"][0] <= 0.5 * summ["fail"][f"{rt}|{tn}|0.0"][0]
                                              for tn in TYPES)
        t["fn_le_plain_plus2_at_rho1"] = sum(summ["fail"][f"{rt}|{tn}|1.0"][1] <= summ["fail"][f"{rt}|{tn}|1.0"][0] + 0.02
                                             for tn in TYPES)
        t["fn_sum_le_plain_every_rho"] = all(
            sum(summ["fail"][f"{rt}|{tn}|{r}"][1] for tn in TYPES) <= sum(summ["fail"][f"{rt}|{tn}|{r}"][0] for tn in TYPES)
            for r in RHOS)
        t["sum_plain"] = {str(r): float(sum(summ["fail"][f"{rt}|{tn}|{r}"][0] for tn in TYPES)) for r in RHOS}
        t["sum_fn"] = {str(r): float(sum(summ["fail"][f"{rt}|{tn}|{r}"][1] for tn in TYPES)) for r in RHOS}
        t["gate_pooled_le2_every_rho"] = all(summ["gate"][f"{rt}|{r}|pooled"][1] <= 0.02 for r in RHOS
                                             if summ["gate"][f"{rt}|{r}|pooled"][2] > 0)
        kept = [summ["gate"][f"{rt}|{r}|pooled"][0] for r in RHOS]
        t["gate_kept_rises"] = all(kept[k + 1] >= kept[k] - 0.01 for k in range(len(kept) - 1))
        t["gate_kept"] = kept
        door = [summ["gate"][f"{rt}|{r}|ShuttingDoor"] for r in RHOS if r >= 0.75]
        t["door_over2_at_rho_ge_0.75"] = any(v[2] > 0 and v[1] > 0.02 for v in door)
        summ["tally"][str(rt)] = t
        ref0[rt] = t
        P(f"  RT60 {rt}: plain monotone in rho (1-pt slack) {mono}/10; rho 0.5 <= 0 dB indep + 2 pts "
          f"{t['model_rho0.5_vs_0dB']}/10; rho 0.9 <= +10 dB indep + 2 pts {t['model_rho0.9_vs_10dB']}/10; "
          f"rho 0.25 halves rho 0 {t['model_rho0.25_le_rho0_half']}/10")
        P(f"    fn <= plain + 2 pts at rho 1: {t['fn_le_plain_plus2_at_rho1']}/10; fn summed <= plain at every rho: "
          f"{t['fn_sum_le_plain_every_rho']}; sums plain " +
          " ".join(f"{v:.2f}" for v in t["sum_plain"].values()) + " fn " + " ".join(f"{v:.2f}" for v in t["sum_fn"].values()))
        P(f"    gate pooled <= 2% at every rho: {t['gate_pooled_le2_every_rho']}; kept rises: {t['gate_kept_rises']} "
          f"({' '.join(f'{k:.2f}' for k in kept)}); door > 2% at rho >= 0.75: {t['door_over2_at_rho_ge_0.75']}")
    open(os.path.join(HERE, f"noisemix{tag}_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, f"noisemix{tag}_summary.json"), "w"), indent=1,
              default=lambda o: o.item() if hasattr(o, "item") else str(o))
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        a = sys.argv
        pr = int(a[a.index("--procs") + 1]) if "--procs" in a else 4
        nt = int(a[a.index("--trials") + 1]) if "--trials" in a else 1000
        collect(a[2], a[3], pr, nt, screen="--screen" in a)
    else:
        score(sys.argv[2], "_screened" if "--screened" in sys.argv else "")
