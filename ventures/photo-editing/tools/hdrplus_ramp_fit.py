"""The noise-aware blend's q ramps refitted on real sensor noise: HDR+ bursts, tune and fresh held-out sets.

``RAMPS`` and ``LUMA_RAMPS`` (``shootflow.xtrans_demosaic``) were fitted on drawn noise
(``eval/xtrans-noise-aware-blend-2026-11-16.md``, ``eval/noise-aware-luma-ramp-2026-11-17.md``). The HDR+ dB sweep
(``eval/hdrplus-demosaic-sweep-2026-11-22.md``) found that on real noise the oracle model loses to the shipped
read on 9 of 48 bursts, and put that on the ramps: a read nearer the truth costs, whichever read it is. This tool
asks whether other ramps do better on real noise, fitted on one set and scored on a fresh one.

``prep`` turns each burst into the scene ``tools/hdrplus_demosaic_sweep.py`` scores (the merge, cell-fitted and
binned 4 x 4, as the truth; the reference's own residual as the noise; the same outlier mask) and saves it with
the three noise models the blend is scored with (``true``, ``ship`` = ``frame_noise`` as it ships, ``mpcws``).
A burst whose files carry no NoiseProfile (91 of the 152 the noise-truth note read, none of them scored before)
has no measured merge fraction ``m``; ``--m-default`` (the 48 tune bursts' median) stands in, which scales the
noise by up to about 20% from what the reference had but leaves its distribution, quantisation and spatial
pattern the sensor's. Its ``true`` arm is the per-colour model fitted under that same ``m``, so it stays the
oracle for the noise in the frame.

``grid`` reads each scene, makes the bilinear and directional demosaics and each arm's block ``q`` (lifted by
``NEAR_DETAIL`` 12, as Bayer ships) once, and blends on every colour ramp with the shipped luma ramp and every
luma ramp with the shipped colour ramp, then the ``JOINT`` pairs; colour and luma PSNR per row, masked as the
sweep masks them.

``fit`` picks ramps on the tune bursts only and applies the rule committed in
``eval/hdrplus-ramp-fit-2026-11-22.md`` on the held-out bursts.

Usage (from ``ventures/photo-editing``, numpy and rawpy installed)::

    PYTHONPATH=src python tools/hdrplus_ramp_fit.py prep --bursts IDS.txt --out SCENES [--m-default 0.1532]
    PYTHONPATH=src python tools/hdrplus_ramp_fit.py grid SCENES/*.npz > rows.jsonl
    python tools/hdrplus_ramp_fit.py fit rows.jsonl --tune TUNE_IDS.txt --held HELD_IDS.txt
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

LOWS = (0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 1.2)
HIGHS = (0.8, 1.0, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0)
GRID = [(lo, hi) for lo in LOWS for hi in HIGHS if hi > lo]
SHIP_C, SHIP_L = (0.4, 1.2), (0.8, 1.5)  # RAMPS[2], LUMA_RAMPS[2] as of 2026-11-22
ARMS = ("ship", "mpcws", "true")
K = 12.0


# ---- prep ----

def prep_burst(burst: str, a_path: Path, b_path: Path, m_default: float | None) -> dict:
    import hdrplus_demosaic_sweep as sw
    import hdrplus_noise_truth as hn
    from shootflow import raw_develop as rd
    from shootflow import xtrans_demosaic as xd

    a, pat, _mults, _prof, raw = hn.plane(a_path)
    b, pat_b, _mb, _pb, raw_b = hn.plane(b_path)
    if a.shape != b.shape or pat != pat_b:
        return {"skip": f"shapes {a.shape} {b.shape} or CFA {pat} {pat_b} differ"}
    if len(pat) != 4:
        return {"skip": f"CFA {pat} is not 2 x 2"}
    B = hn.BORDER
    a, b = a[B:-B, B:-B], b[B:-B, B:-B]
    np_a, np_b = rd.noise_profile(raw.ifd, raw.ifd0), rd.noise_profile(raw_b.ifd, raw_b.ifd0)
    if np_a is not None and np_b is not None:
        ta = np.asarray(np_a, dtype=np.float64).reshape(-1, 2)
        tb = np.asarray(np_b, dtype=np.float64).reshape(-1, 2)
        m, m_src = float(np.mean(tb[:, 0] / ta[:, 0])), "profiles"
    elif m_default is not None:
        m, m_src = float(m_default), "default"
    else:
        return {"skip": "no NoiseProfile on one of the two files"}
    planes, _bins = hn.truth_model(hn.residual_sites(a, b), pat, m)
    fit, res, ok = sw.full_fit(a, b)
    truth, noisy, bad, z = sw.binned_scene(fit, res, ok, pat, planes, m)
    drop = sw._grow(bad | (np.abs(z) > sw.OUTLIER_Z), sw.MASK_GROW)
    share = float(drop.mean())
    true_model = tuple(float(v) for v in planes.mean(axis=0))
    info = {"model": hn._text(raw.ifd0.get(272)), "iso": (raw.exif or {}).get(34855, [None])[0],
            "m": round(m, 4), "m_src": m_src, "dropped_share": round(share, 5), "size": list(noisy.shape),
            "true_sigma18": round(float(max(true_model[0] * 0.18 + true_model[1], 0.0) ** 0.5), 6)}
    if share > sw.DROP_MAX:
        return {**info, "skip": f"{share:.3f} of the frame masked (over {sw.DROP_MAX:g})"}
    models = {"true": true_model, "ship": tuple(xd.frame_noise(noisy, pat)),
              "mpcws": tuple(xd.frame_noise(noisy, pat, eig="mpcws"))}
    return {**info, "pat": list(pat), "models": models,
            "_arrays": {"truth": truth, "noisy": noisy.astype(np.float64), "keep": ~drop}}


def prep(args) -> int:
    import hdrplus_noise_truth as hn

    args.out.mkdir(parents=True, exist_ok=True)
    for burst in [x.strip() for x in args.bursts.read_text().splitlines() if x.strip()]:
        dest = args.out / f"{burst}.npz"
        if dest.exists():
            continue
        t0 = time.perf_counter()
        try:
            a, b = hn.fetch(burst, args.cache)
            row = prep_burst(burst, a, b, args.m_default)
        except Exception as exc:  # noqa: BLE001
            row = {"skip": f"{type(exc).__name__}: {exc}"}
        arrays = row.pop("_arrays", None)
        row = {"burst": burst, **row, "s": round(time.perf_counter() - t0, 1)}
        if arrays is not None:
            np.savez_compressed(dest, meta=json.dumps(row), **arrays)
        print(json.dumps(row), flush=True)
        for p in (args.cache / burst).glob("*.dng"):
            p.unlink()
    return 0


# ---- grid ----

def grid_scene(path: Path) -> list[dict]:
    from shootflow import xtrans_demosaic as xd
    from shootflow.bayer_demosaic import directional

    import hdrplus_demosaic_sweep as sw
    import xtrans_demosaic_check as chk

    z = np.load(path)
    meta = json.loads(str(z["meta"]))
    truth, c, keep = z["truth"].astype(np.float64), z["noisy"], z["keep"]
    pat = tuple(meta["pat"])
    b = chk.ours_bilinear(c, pat)
    d = directional(c, pat)
    base = {k: meta[k] for k in ("burst", "model", "iso", "m", "m_src", "true_sigma18")}
    rows = [{**base, "arm": "D", "cl": None, "ll": None, "scores": sw.masked_scores(d, truth, keep)}]
    pairs = ([(cr, SHIP_L) for cr in GRID] + [(SHIP_C, lr) for lr in GRID if lr != SHIP_L]
             + [(cr, lr) for cr in JOINT_C for lr in JOINT_L if cr != SHIP_C and lr != SHIP_L])
    for arm in ARMS:
        q = xd.frame_measures(c, pat, b, d, noise=tuple(meta["models"][arm]), blocks=True)["q_blocks"]
        q = xd.lift_near_detail(q, K)
        for cr, lr in pairs:
            out = xd.blend(b, d, q, cr[0], cr[1], luma_ramp=lr)
            rows.append({**base, "arm": arm, "cl": list(cr), "ll": list(lr),
                         "scores": sw.masked_scores(out, truth, keep)})
    return rows


# a small joint neighbourhood around where the drawn-noise fits and the pilot pointed
JOINT_C = [(0.3, 1.0), (0.3, 1.2), (0.4, 1.0), (0.4, 1.5), (0.5, 1.5), (0.6, 1.5), (0.6, 2.0)]
JOINT_L = [(0.6, 1.2), (0.6, 1.5), (0.8, 1.2), (0.8, 2.0), (1.0, 1.5), (1.0, 2.0), (1.2, 2.0)]


def grid(paths) -> int:
    for p in paths:
        t0 = time.perf_counter()
        rows = grid_scene(Path(p))
        for r in rows:
            print(json.dumps(r), flush=True)
        print(f"{Path(p).stem}: {len(rows)} rows, {time.perf_counter() - t0:.0f} s", file=sys.stderr, flush=True)
    return 0


# ---- fit ----

def _table(rows: list[dict]) -> dict:
    """{burst: {(arm, cl, ll) or ('D',): (colour, luma)}}"""

    t: dict = {}
    for r in rows:
        key = ("D",) if r["arm"] == "D" else (r["arm"], tuple(r["cl"]), tuple(r["ll"]))
        t.setdefault(r["burst"], {})[key] = tuple(r["scores"])
    return t


def _gains(t, bursts, key, ref):
    g = np.array([[t[b][key][i] - t[b][ref][i] for i in (0, 1)] for b in bursts])
    return g[:, 0], g[:, 1]  # colour, luma


def fit(args) -> int:
    rows = [json.loads(x) for x in args.rows.read_text().splitlines() if x.strip()]
    t = _table(rows)
    ids = lambda p: [x.strip() for x in p.read_text().splitlines() if x.strip()]  # noqa: E731
    tune = [b for b in ids(args.tune) if b in t]
    held = [b for b in ids(args.held) if b in t]
    print(f"tune {len(tune)} bursts scored, held {len(held)} scored")
    sigma = {r["burst"]: r["true_sigma18"] for r in rows}
    out: dict = {"tune": len(tune), "held": len(held)}
    for arm in ARMS:
        ship = (arm, SHIP_C, SHIP_L)
        keys = [k for k in t[tune[0]] if k[0] == arm]
        # pick on tune: the sum of mean colour and mean luma gain over the shipped ramps, same arm
        score = {}
        for k in keys:
            gc, gl = _gains(t, tune, k, ship)
            score[k] = (gc.mean() + gl.mean(), gc.mean(), gl.mean())
        best = max(score, key=lambda k: score[k][0])
        print(f"\n## {arm}: shipped ramps colour {SHIP_C} luma {SHIP_L}")
        print("  tune, top 8 by colour + luma gain over the shipped ramps (dB):")
        for k in sorted(score, key=lambda k: -score[k][0])[:8]:
            print(f"    colour {k[1]} luma {k[2]}: sum {score[k][0]:+.4f} (colour {score[k][1]:+.4f}, luma {score[k][2]:+.4f})")
        gc_d, gl_d = _gains(t, tune, ship, ("D",))
        print(f"  tune, shipped ramps over D: colour {gc_d.mean():+.4f} luma {gl_d.mean():+.4f}")
        res = {"pick": [list(best[1]), list(best[2])], "tune": [round(float(v), 4) for v in score[best]]}
        if held:
            gc, gl = _gains(t, held, best, ship)
            hc, hl = _gains(t, held, best, ("D",))
            sc, sl = _gains(t, held, ship, ("D",))
            s = np.array([sigma[b] for b in held])
            cut = np.quantile(s, [1 / 3, 2 / 3])
            th = [s <= cut[0], (s > cut[0]) & (s <= cut[1]), s > cut[1]]
            worse = int(((gc < -0.1) | (gl < -0.1)).sum())
            losers_new = int((((hc < -0.1) | (hl < -0.1)) & ~((sc < -0.1) | (sl < -0.1))).sum())
            losers_ship = int(((sc < -0.1) | (sl < -0.1)).sum())
            cells = [(float(gl[m].mean()), float(gc[m].mean())) for m in th]
            print(f"  held, pick over the shipped ramps: colour {gc.mean():+.4f} luma {gl.mean():+.4f}; "
                  f"thirds (luma/colour) " + "  ".join(f"{a:+.3f}/{b:+.3f}" for a, b in cells))
            print(f"    bursts > 0.1 dB under the shipped ramps: {worse}; new losers to D: {losers_new} "
                  f"(shipped ramps lose to D on {losers_ship}); median luma {np.median(gl):+.4f}, "
                  f"worst {min(gc.min(), gl.min()):+.3f}")
            res.update(held_colour=round(float(gc.mean()), 4), held_luma=round(float(gl.mean()), 4),
                       held_thirds=[[round(a, 4), round(b, 4)] for a, b in cells], held_worse=worse,
                       held_new_losers=losers_new, held_ship_losers=losers_ship)
        out[arm] = res
    if args.json:
        args.json.write_text(json.dumps(out, indent=1) + "\n")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("prep")
    p.add_argument("--bursts", type=Path, required=True)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--cache", type=Path, default=Path("/tmp/hdrplus"))
    p.add_argument("--m-default", type=float)
    g = sub.add_parser("grid")
    g.add_argument("scenes", nargs="+")
    f = sub.add_parser("fit")
    f.add_argument("rows", type=Path)
    f.add_argument("--tune", type=Path, required=True)
    f.add_argument("--held", type=Path, required=True)
    f.add_argument("--json", type=Path)
    args = ap.parse_args(argv)
    if args.cmd == "prep":
        return prep(args)
    if args.cmd == "grid":
        return grid(args.scenes)
    return fit(args)


if __name__ == "__main__":
    sys.exit(main())
