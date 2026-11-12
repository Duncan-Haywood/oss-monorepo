"""Milestone 5y: the first measured excavator pressure trace, against the force model's 33 bar.

Data: `fuxi-robot/excavator-motion` on Hugging Face (CC BY-NC-SA 4.0), folder `490`: ten truck-loading
trajectories of one excavator (49 t class by our reading of the folder name; the card does not say),
with `observations/pressure` (8 unlabelled channels, Pa), `observations/qpos` (boom, arm, bucket,
swing joint angles, rad) and `observations/timestamps` (ns), about 10 Hz. Only those arrays are
fetched (hf_range.py); nothing from the dataset is committed. Predictions Y1 to Y5 were registered in
LOG.md (5y) before this script was written.

Usage: python measured_excavator.py [cache dir]   (default ~/.cache/heavy-hydraulics-excavator)
Needs numpy and h5py; about 10 to 15 minutes on first run (300 MB of range reads), seconds after.
"""
import os
import random
import statistics
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
sys.path.insert(0, HERE)
from heavy_hydraulics.measured import central_speed, highest_live  # noqa: E402
from hf_range import list_files, small_arrays  # noqa: E402

V_MOVE, V_STILL, LIVE_RANGE = 0.05, 0.01, 5.0     # rad/s, rad/s, bar (fixed in LOG.md before the run)
SWEEP = (0.02, 0.03, 0.05, 0.07, 0.10)
P_FORCE, R_SYNTH, LOADER_PQ, COV = 33.0, 1.433, 133.9, 0.78   # 5u, 5u, 5v, 5v (m*/R2 on the loader)


def boot_median(vals, n=4000, seed=0):
    rng = random.Random(seed)
    m = len(vals)
    meds = sorted(statistics.median(rng.choice(vals) for _ in range(m)) for _ in range(n))
    return meds[int(0.025 * n)], meds[int(0.975 * n)]


def load(cache):
    recs = []
    for path in list_files("490"):
        d = small_arrays(path, cache)
        p = d["observations__pressure"] / 1e5                    # Pa -> bar
        q = d["observations__qpos"].astype(float)
        t = (d["observations__timestamps"] - d["observations__timestamps"][0]) / 1e9
        recs.append({"name": os.path.basename(path), "n_p": len(p), "n_q": len(q), "p_all": p, "q_all": q, "t_all": t})
        pair(recs[-1], 0)
    return recs


def pair(r, offset):
    """Pair pressure row i + offset with qpos row i (offset 0: as stored, from the start); drop repeated timestamps."""
    p, q, t = r["p_all"], r["q_all"], r["t_all"]
    if offset >= 0:
        p, t = p[offset:], t[offset:]
    else:
        q = q[-offset:]
    n = min(len(p), len(q))
    keep = np.concatenate([[True], np.diff(t[:n]) > 0])
    r.update(p=p[:n][keep], q=q[:n][keep], t=t[:n][keep], dropped=int((~keep).sum()))


def speeds(r):
    return np.array([central_speed(list(r["t"]), list(r["q"][:, j])) for j in range(4)]).T


def main(cache):
    recs = load(cache)
    out = []
    p = out.append
    p(f"{len(recs)} files, folder 490; samples paired by index from the start (pressure rows - qpos rows per file: "
      f"{[r['n_p'] - r['n_q'] for r in recs]}; repeated timestamps dropped: {sum(r['dropped'] for r in recs)})")
    dts = np.concatenate([np.diff(r["t"]) for r in recs])
    p(f"total {sum(r['t'][-1] for r in recs)/60:.1f} min; sample interval median {np.median(dts)*1e3:.1f} ms "
      f"(p1 {np.percentile(dts, 1)*1e3:.1f}, p99 {np.percentile(dts, 99)*1e3:.1f})")

    # check: the tested stdlib helpers agree with a numpy twin on the first file
    r0 = recs[0]
    qq, tt = r0["q"][:, 0], r0["t"]
    ia, ib = np.maximum(np.arange(len(qq)) - 1, 0), np.minimum(np.arange(len(qq)) + 1, len(qq) - 1)
    v_np = np.abs(qq[ib] - qq[ia]) / (tt[ib] - tt[ia])
    v_sl = np.array(central_speed(list(r0["t"]), list(r0["q"][:, 0])))
    assert np.allclose(v_np, v_sl, rtol=1e-9, atol=1e-12)
    p("check: stdlib central_speed equals a numpy central difference on file 1, boom joint")

    # liveness per channel per file (Y2)
    p("")
    p("channel range (max - min, bar) per file; live = range > 5 bar")
    rng_tab = np.array([[r["p"][:, c].max() - r["p"][:, c].min() for c in range(8)] for r in recs])
    for c in range(8):
        p(f"  ch{c}: min range {rng_tab[:, c].min():7.1f}, median {np.median(rng_tab[:, c]):7.1f}")
    live_all = [c for c in range(8) if (rng_tab[:, c] > LIVE_RANGE).all()]
    p(f"  live in every file: {live_all}")

    pooled = {"mov": [], "still": [], "hi_mov": [], "which": [], "ch_mov": [], "ch_still": []}
    per_file = []
    for r in recs:
        v = speeds(r)
        live = [c for c in range(8) if r["p"][:, c].max() - r["p"][:, c].min() > LIVE_RANGE]
        hi = np.array([highest_live(row, live) for row in r["p"]])
        assert np.allclose(hi, r["p"][:, live].max(axis=1))
        mov = (v[:, :3] > V_MOVE).any(axis=1)
        still = (v < V_STILL).all(axis=1)
        pooled["hi_mov"].append(hi[mov])
        pooled["which"].append(np.array(live)[np.argmax(r["p"][:, live], axis=1)][mov])
        pooled["ch_mov"].append(r["p"][mov])
        pooled["ch_still"].append(r["p"][still])
        per_file.append({"med": float(np.median(hi[mov])), "mean": float(hi[mov].mean()),
                         "mov_share": float(mov.mean()), "still_share": float(still.mean()),
                         "hi_still": float(np.median(hi[still])) if still.any() else float("nan")})

    hi_mov = np.concatenate(pooled["hi_mov"])
    ch_mov = np.concatenate(pooled["ch_mov"])
    ch_still = np.concatenate(pooled["ch_still"])
    which = np.concatenate(pooled["which"])
    p("")
    p(f"moving (any of boom, arm, bucket > {V_MOVE} rad/s): {len(hi_mov)} samples, "
      f"{100*len(hi_mov)/sum(len(r['t']) for r in recs):.1f}%; still (all four < {V_STILL} rad/s): {len(ch_still)} samples")
    p("per channel, bar: median moving, median still, mean moving; share of moving samples where it is the highest live channel")
    for c in range(8):
        sh = (which == c).mean() * 100
        p(f"  ch{c}: {np.median(ch_mov[:, c]):7.1f} {np.median(ch_still[:, c]):7.1f} {ch_mov[:, c].mean():7.1f}   {sh:5.1f}%")
    p("")
    p("highest live channel while moving, per file: median, mean, moving share, median while still")
    for r, f in zip(recs, per_file):
        p(f"  {r['name']}: {f['med']:6.1f} {f['mean']:6.1f} bar, moving {100*f['mov_share']:4.1f}%, still median {f['hi_still']:6.1f}")
    meds = [f["med"] for f in per_file]
    lo, hi_ = boot_median(meds)
    pooled_med = float(np.median(hi_mov))
    p(f"pooled median {pooled_med:.1f} bar (p10 {np.percentile(hi_mov, 10):.1f}, p90 {np.percentile(hi_mov, 90):.1f}); "
      f"median of file medians {statistics.median(meds):.1f}, 95% bootstrap {lo:.1f} to {hi_:.1f} bar")

    p("")
    p("sweep of the moving threshold (rad/s): pooled median of the highest live channel, moving share")
    for vm in SWEEP:
        xs, ns, tot = [], 0, 0
        for r in recs:
            v = speeds(r)
            live = [c for c in range(8) if r["p"][:, c].max() - r["p"][:, c].min() > LIVE_RANGE]
            m = (v[:, :3] > vm).any(axis=1)
            xs.append(r["p"][m][:, live].max(axis=1))
            ns += m.sum()
            tot += len(m)
        p(f"  {vm:.2f}: {np.median(np.concatenate(xs)):6.1f} bar, {100*ns/tot:4.1f}%")
    p("without channel 7 (if it is a supply pressure, the rest are nearer load pressures): pooled moving median of the "
      f"highest of the others {np.median(ch_mov[:, [c for c in live_all if c != 7]].max(axis=1)):.1f} bar")

    # pairing sensitivity: the files do not say which pressure rows the missing qpos rows match. Correlating pressure
    # with joint speed cannot settle it on an excavator (pressure peaks in slow, high-force digging), so the headline is
    # shown under every pairing: as stored, aligned at the end, shifted 30 samples, and with no motion mask at all.
    p("")
    p("pairing sensitivity: pooled moving median of the highest live channel")
    all_hi = np.concatenate([r["p_all"][:, live_all].max(axis=1) for r in recs])
    for lab, off in (("as stored (start)", lambda r: 0), ("aligned at the end", lambda r: r["n_p"] - r["n_q"]),
                     ("pressure 30 rows later", lambda r: 30), ("pressure 30 rows earlier", lambda r: -30)):
        xs = []
        for r in recs:
            pair(r, off(r))
            m = (speeds(r)[:, :3] > V_MOVE).any(axis=1)
            xs.append(r["p"][m][:, live_all].max(axis=1))
        p(f"  {lab:26s} {np.median(np.concatenate(xs)):6.1f} bar")
        for r in recs:
            pair(r, 0)
    p(f"  {'every sample, no mask':26s} {np.median(all_hi):6.1f} bar (mean {all_hi.mean():.1f})")

    # not registered: a 49 t machine runs a higher relief than the force model's 180 bar small machine, so compare
    # pressure as a share of the machine's own top pressure (p99.9 of the highest live channel over all samples)
    top = float(np.percentile(all_hi, 99.9))
    p("")
    p(f"not registered: share of top pressure. Measured top (p99.9 of highest live channel) {top:.1f} bar, max {all_hi.max():.1f}; "
      f"moving median / top {pooled_med/top:.3f}; force model {P_FORCE:.0f} / 180 bar relief {P_FORCE/180:.3f}; "
      f"ratio {pooled_med/top/(P_FORCE/180):.2f}")
    p(f"  at the force model's 180 bar relief, the measured share means a working pressure of {180*pooled_med/top:.1f} bar; "
      f"R2 at r {R_SYNTH} then {(R_SYNTH-1)*180*pooled_med/top:.1f} bar, times {COV} {COV*(R_SYNTH-1)*180*pooled_med/top:.1f} bar")

    no7 = [c for c in live_all if c != 7]
    hi7 = np.concatenate([r["p_all"][:, no7].max(axis=1) for r in recs])
    top7 = float(np.percentile(hi7, 99.9))
    med7 = float(np.median(ch_mov[:, no7].max(axis=1)))
    p(f"  without ch7 (it alone passes 400 bar): top {top7:.1f} bar, moving median {med7:.1f}, share {med7/top7:.3f} "
      f"(ratio to the force model's share {med7/top7/(P_FORCE/180):.2f}; at 180 bar {180*med7/top7:.1f} bar)")
    p(f"  channel p99.9 over all samples, bar: " + ", ".join(
        f"ch{c} {np.percentile(np.concatenate([r['p_all'][:, c] for r in recs]), 99.9):.0f}" for c in live_all))

    # verdicts
    p("")
    p(f"Y1 {'HOLDS' if pooled_med > 100 and lo > 100 else 'REFUTED'} (moving median of the highest live channel > 100 bar, "
      f"bootstrap above 100: {pooled_med:.1f}; {lo:.1f} to {hi_:.1f})")
    dead = [c for c in range(8) if (rng_tab[:, c] < LIVE_RANGE).all()]
    p(f"Y2 {'HOLDS' if 4 in dead else 'REFUTED'} (ch4 range under 5 bar in every file: max range {rng_tab[:, 4].max():.2f} bar; "
      f"dead in every file: {dead})")
    up = np.median(ch_mov[:, 7]) / np.median(ch_still[:, 7]) - 1
    sh7 = (which == 7).mean()
    p(f"Y3 {'HOLDS' if up > 0.30 and sh7 > 0.5 else 'REFUTED'} (ch7 moving over still median +{100*up:.1f}%; "
      f"highest in {100*sh7:.1f}% of moving samples)")
    r2 = (R_SYNTH - 1) * pooled_med
    p(f"Y4 {'HOLDS' if COV * r2 > 40 else 'REFUTED'} (R2 at r {R_SYNTH}: force model {(R_SYNTH-1)*P_FORCE:.1f} bar -> measured "
      f"{r2:.1f} bar; times {COV} = {COV*r2:.1f} bar)")
    p(f"Y5 {'HOLDS' if 0.7 * LOADER_PQ <= pooled_med <= 1.3 * LOADER_PQ else 'REFUTED'} (moving median within 30% of the "
      f"loader's {LOADER_PQ} bar: {pooled_med:.1f}, ratio {pooled_med/LOADER_PQ:.2f})")
    p(f"ratio to the force model's {P_FORCE:.0f} bar: {pooled_med/P_FORCE:.2f}")
    return "\n".join(out)


if __name__ == "__main__":
    cache = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.cache/heavy-hydraulics-excavator")
    text = main(cache)
    print(text)
    with open(os.path.join(HERE, "measured_excavator_results.txt"), "w") as fh:
        fh.write(text + "\n")
