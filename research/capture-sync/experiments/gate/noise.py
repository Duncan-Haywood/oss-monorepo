"""Step 3b: a noise-aware gate. Does conditioning on a window's own noise estimate, or scoring it with the
threshold theory, keep the failure bound when the noise level shifts?

    python experiments/gate/noise.py collect <LibriWASN root> <windows_b.npz> [--procs 4]
    python experiments/gate/noise.py score <windows_b.npz>

`collect` replays step 1 (experiments/real-devices/run.py: same sessions, seeds, window times, prior
errors and added noise) for gamma 1 (PHAT) and gamma 0.25 only, and keeps for every window:
  err, psr      as step 3 (so the replay check is exact);
  p_blind       the threshold theory's gross-error probability (src/capture_sync/threshold.py, cells
                model, span 2 x 1.5 s minus two frames) from Welch spectra of the two windows aligned at the
                window's own estimate (no ground truth; step 2a's "blind" score);
  snr_hat       the window's blind SNR estimate (gate.blind_snr_db: 90th/10th percentile of 32 ms frame
                energies, the smaller of the two phones' windows).
The npz holds numbers derived from LibriWASN (CC BY 4.0, doi:10.5281/zenodo.10952434) and is not committed;
`score` writes noise_results.txt and noise_summary.json beside this file.

Gates, each Learn then Test at alpha = 1% failure among accepted, delta = 0.1 (src/capture_sync/gate.py):
  pooled    step 3's gate: PSR >= lam, one threshold, noise levels pooled in calibration;
  mondrian  PSR >= lam_k in the calibration-quartile bin k of snr_hat, and refuse windows whose snr_hat is
            below the calibration's 1st percentile (outside what the calibration saw);
  theory    accept when p_blind <= t (score -p_blind), one threshold, pooled; the bet is that a score which
            already accounts for the window's spectra transfers across noise levels where PSR does not.
Shifts as step 3 (S1 within-room 5/5 session splits, S2 room, S3 phone, S4 noise: calibrate on as
recorded + 0 dB, test on -10 dB).
"""
import itertools
import json
import os
import sys
from concurrent.futures import ProcessPoolExecutor

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "src"))
sys.path.insert(0, os.path.join(HERE, "..", "real-devices"))
from capture_sync import FS, gcc, coarse_offset, reference_line, line_at, auroc  # noqa: E402
from capture_sync.gate import (ltt_threshold, apply_gate, blind_snr_db, mondrian_ltt,  # noqa: E402
                               mondrian_accept)
from capture_sync.threshold import predict  # noqa: E402

FRAME = 1 / 30
ALPHA, DELTA = 0.01, 0.1
GRID = np.geomspace(2.0, 400.0, 241)          # PSR grid, step 3's
TGRID = -np.geomspace(0.5, 1e-6, 241)         # -p_blind grid, fixed before the run
GAMMAS = [1.0, 0.25]
WINS = [0.5, 1.0, 2.0, 4.0]
PHONES = ["Nexus", "Pixel6a", "Pixel6b", "Pixel7", "Xiaomi"]


def run_session(args):
    """step 1's run_session, trial loop copied line for line (same rng draws), keeping the extra features."""
    import run as step1
    room, sess, paths, n_trials, seed = args
    rng = np.random.default_rng(seed)
    x = {p: step1.load(paths[p]) for p in PHONES}
    refs, usable = {}, {}
    for i, j in itertools.combinations(range(len(PHONES)), 2):
        a, b = PHONES[i], PHONES[j]
        d0, _ = coarse_offset(x[a], x[b])
        r1 = reference_line(x[a], x[b], d0, gamma=1.0)
        refs[(a, b)] = r1
        usable[(a, b)] = float(np.mean(np.abs(r1["resid"]) < 0.005)) >= 0.5
    span = 2 * step1.SEARCH - 2 * FRAME
    rows = []
    for (a, b), ref in refs.items():
        dur = min(len(x[a]), len(x[b])) / FS
        for _ in range(n_trials):
            t = float(rng.uniform(2.0, dur - 8.0 - abs(ref["d"])))
            u = float(rng.uniform(-step1.PRIOR, step1.PRIOR))
            for snr in step1.SNRS:
                for L in step1.WINS:
                    truth = line_at(ref, t + L / 2)
                    i0 = int(round(t * FS))
                    n = int(round(L * FS))
                    g_ = int(round(step1.SEARCH * FS))
                    j0 = int(round((t + truth + u) * FS)) - g_
                    if j0 < 0 or j0 + n + 2 * g_ > len(x[b]):
                        continue
                    wa = x[a][i0:i0 + n].copy()
                    wb = x[b][j0:j0 + n + 2 * g_].copy()
                    if snr is not None:
                        wa += rng.standard_normal(len(wa)) * np.sqrt(np.mean(wa ** 2) / 10 ** (snr / 10))
                        pb = np.mean(wb[g_:g_ + n] ** 2)
                        wb += rng.standard_normal(len(wb)) * np.sqrt(pb / 10 ** (snr / 10))
                    sh = min(blind_snr_db(wa), blind_snr_db(wb[g_:g_ + n]))
                    row = [int(room), PHONES.index(a), PHONES.index(b), L, 99.0 if snr is None else snr,
                           float(usable[(a, b)]), sh]
                    for g in GAMMAS:
                        d, p = gcc(wa, wb, gamma=g, max_lag_s=step1.SEARCH, centre_s=step1.SEARCH)
                        kb = int(np.clip(round(d * FS), 0, 2 * g_))
                        pbl = predict(wa, wb[kb:kb + n], L, g, span)
                        row += [truth + u + d - step1.SEARCH - truth, p, pbl]
                    rows.append(row)
    return room + "/" + sess, rows


def collect(root, out, procs):
    import run as step1
    jobs = []
    for room in step1.ROOMS:
        for k, (s, paths) in enumerate(step1.sessions(root, room)):
            jobs.append((room, s, paths, 40, 1000 * int(room) + k))
    with ProcessPoolExecutor(procs) as ex:
        res = list(ex.map(run_session, jobs))
    names = sorted(r[0] for r in res)
    rows = [[names.index(nm)] + row for nm, rr in res for row in rr]
    np.savez_compressed(out, rows=np.array(rows, float), sessions=np.array(names))
    print(f"{len(rows)} windows -> {out}")


def load(path):
    r = np.load(path)["rows"]
    d = {"sess": r[:, 0].astype(int), "room": r[:, 1].astype(int), "a": r[:, 2].astype(int),
         "b": r[:, 3].astype(int), "L": r[:, 4], "snr": r[:, 5], "ok": r[:, 6] > 0.5, "snr_hat": r[:, 7]}
    for k, g in enumerate(GAMMAS):
        c = 8 + 3 * k
        d[g] = {"err": r[:, c], "psr": r[:, c + 1], "pbl": r[:, c + 2], "bad": np.abs(r[:, c]) > FRAME}
    return d


def evaluate(d, g, cal, test):
    """All three gates calibrated on `cal`, scored on `test` (boolean masks)."""
    w, sh = d[g], d["snr_hat"]
    out = {"n_test": int(test.sum()), "fail_all": float(w["bad"][test].mean())}
    lam = ltt_threshold(w["psr"][cal], w["bad"][cal], GRID, ALPHA, DELTA)
    out["pooled"] = apply_gate(w["psr"][test], w["bad"][test], lam) + (lam,)
    floor, inner, lams = mondrian_ltt(w["psr"][cal], w["bad"][cal], sh[cal], GRID, ALPHA, DELTA)
    acc = mondrian_accept(w["psr"][test], sh[test], floor, inner, lams)
    n = int(acc.sum())
    out["mondrian"] = (n / max(int(test.sum()), 1), float(w["bad"][test][acc].mean()) if n else float("nan"), n,
                       [floor] + list(inner) + list(lams))
    out["support"] = float(np.mean(sh[test] >= floor))
    t = ltt_threshold(-w["pbl"][cal], w["bad"][cal], TGRID, ALPHA, DELTA)
    out["theory"] = apply_gate(-w["pbl"][test], w["bad"][test], t) + (t,)
    return out


GATES = ["pooled", "mondrian", "theory"]


def fmt(e):
    s = []
    for gname in GATES:
        kept, fk, n = e[gname][:3]
        s.append(f"{gname} kept {kept:.2f} fail|kept {'  -   ' if n == 0 else f'{fk:.4f}'}")
    return f"(all {e['fail_all']:.3f}, n {e['n_test']}, in support {e['support']:.2f}) " + " | ".join(s)


def score(path):
    d = load(path)
    ok = d["ok"]
    out, summ = [], {"replay": {}, "auroc": {}, "S1": {}, "S2": {}, "S3": {}, "S4": {}, "snr_hat": {}}
    P = out.append
    P("capture-sync step 3b: noise-aware gates on LibriWASN phones (LTT, alpha 1% failure among accepted, "
      "delta 0.1)")
    P(f"windows: {int(ok.sum())} usable of {len(ok)}; gammas {GAMMAS}; gates: {', '.join(GATES)}")
    P("")
    P("== Replay: raw failure shares per cell (compare step 3's summary.json 'replay', gamma 1 and 0.25) ==")
    for room in (200, 800):
        for snr in (99.0, 0.0, -10.0):
            for L in WINS:
                m = ok & (d["room"] == room) & (d["snr"] == snr) & (d["L"] == L)
                summ["replay"][f"{room}|{snr}|{L}"] = [float(d[g]["bad"][m].mean()) for g in GAMMAS]
    P("")
    P("== The blind SNR estimate by added noise (median [5th, 95th pct], dB; all windows of that length) ==")
    for L in WINS:
        row = []
        for snr in (99.0, 0.0, -10.0):
            v = d["snr_hat"][ok & (d["L"] == L) & (d["snr"] == snr)]
            q = np.percentile(v, [5, 50, 95])
            summ["snr_hat"][f"{L}|{snr}"] = [float(x) for x in q]
            row.append(f"{'as rec.' if snr == 99 else f'{snr:+.0f} dB'} {q[1]:5.1f} [{q[0]:5.1f},{q[2]:5.1f}]")
        P(f"  {L:3.1f} s: " + "   ".join(row))
    P("")
    P("== Failure flag AUROC, by window and weighting, all noise levels pooled (PSR vs theory p_blind) ==")
    for L in WINS:
        for g in GAMMAS:
            m = ok & (d["L"] == L)
            b = d[g]["bad"][m]
            a1 = auroc(d[g]["psr"][m][b], d[g]["psr"][m][~b])  # good windows score higher
            a2 = auroc(-d[g]["pbl"][m][b], -d[g]["pbl"][m][~b])
            a3 = auroc(d["snr_hat"][m][b], d["snr_hat"][m][~b])
            summ["auroc"][f"{L}|{g}"] = {"psr": a1, "theory": a2, "snr_hat": a3, "fail": float(b.mean())}
            P(f"  {L:3.1f} s gamma {g:4}: fail {b.mean():.3f}  AUROC psr {a1:.3f}  theory {a2:.3f}  "
              f"snr_hat {a3:.3f}")
    P("")

    P("== S4 noise shift: calibrate on as recorded + 0 dB, test on -10 dB, same room ==")
    for room in (200, 800):
        for L in WINS:
            for g in GAMMAS:
                base = ok & (d["room"] == room) & (d["L"] == L)
                e = evaluate(d, g, base & (d["snr"] != -10.0), base & (d["snr"] == -10.0))
                summ["S4"][f"{room}|{L}|{g}"] = e
                P(f"  room {room} {L:3.1f} s g {g:4}: {fmt(e)}")
    P("")
    P("== S2 room shift: calibrate on one room (noise pooled), test on the other, by test noise ==")
    for src, dst in ((200, 800), (800, 200)):
        for L in WINS:
            for g in GAMMAS:
                cal = ok & (d["room"] == src) & (d["L"] == L)
                for snr in (None, 99.0, 0.0, -10.0):
                    test = ok & (d["room"] == dst) & (d["L"] == L)
                    if snr is not None:
                        test &= d["snr"] == snr
                    e = evaluate(d, g, cal, test)
                    summ["S2"][f"{src}->{dst}|{L}|{g}|{snr}"] = e
                    nm = "pooled" if snr is None else ("as rec." if snr == 99 else f"{snr:+.0f} dB")
                    P(f"  {src}->{dst} {L:3.1f} s g {g:4} {nm:7s}: {fmt(e)}")
    P("")
    P("== S3 phone shift: calibrate on the 6 pairs without phone P (both rooms, noise pooled), test on its 4 ==")
    for L in WINS:
        for g in GAMMAS:
            for k, ph in enumerate(PHONES):
                has = (d["a"] == k) | (d["b"] == k)
                base = ok & (d["L"] == L)
                e = evaluate(d, g, base & ~has, base & has)
                summ["S3"][f"{ph}|{L}|{g}"] = e
                P(f"  {L:3.1f} s g {g:4} {ph:8s}: {fmt(e)}")
    P("")
    P("== S1 within-room 5/5 session splits, 50 per room: share of splits with fail|kept > 1%, mean kept ==")
    rng = np.random.default_rng(3)  # step 3's seed, so the splits are step 3's
    for room in (200, 800):
        sessions = np.unique(d["sess"][d["room"] == room])
        splits = [rng.permutation(sessions)[:5] for _ in range(50)]
        for L in WINS:
            for g in GAMMAS:
                base = ok & (d["room"] == room) & (d["L"] == L)
                ev = [evaluate(d, g, base & np.isin(d["sess"], cs), base & ~np.isin(d["sess"], cs))
                      for cs in splits]
                r = {}
                for gname in GATES:
                    fk = np.array([e[gname][1] if e[gname][2] else 0.0 for e in ev])
                    r[gname] = {"viol": float(np.mean(fk > ALPHA)), "viol2": float(np.mean(fk > 2 * ALPHA)),
                                "kept": float(np.mean([e[gname][0] for e in ev])), "fail_kept": float(fk.mean())}
                summ["S1"][f"{room}|{L}|{g}"] = r
                P(f"  room {room} {L:3.1f} s g {g:4}: " + " | ".join(
                    f"{gname} viol {r[gname]['viol']:.2f} (>2a {r[gname]['viol2']:.2f}) kept {r[gname]['kept']:.2f}"
                    for gname in GATES))
    open(os.path.join(HERE, "noise_results.txt"), "w").write("\n".join(out) + "\n")
    json.dump(summ, open(os.path.join(HERE, "noise_summary.json"), "w"), indent=1)
    print("\n".join(out))


if __name__ == "__main__":
    if sys.argv[1] == "collect":
        procs = int(sys.argv[sys.argv.index("--procs") + 1]) if "--procs" in sys.argv else 4
        collect(sys.argv[2], sys.argv[3], procs)
    else:
        score(sys.argv[2])
