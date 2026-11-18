"""The noise-aware demosaic with no NoiseProfile: a noise model read from the frame itself, scaled.

``--demosaic noise-aware`` needs the sensor's (shot, read) noise model. A DNG may carry one (NoiseProfile); a
raw read directly (ARW, NEF, CR2, RW2, ORF, PEF, SRW, RAF, ...) does not, so the developer fell back to the
directional demosaic. ``xtrans_demosaic.estimate_noise`` fits the model from the mosaic alone, but texture adds
to every block's spread, so on a detailed frame it reads high, and an overstated model costs dB (the docstring
of ``noise_aware``: "lost up to 5 dB on held-out tiles"). An understated one only moves the blend toward the
directional default. So the question is how far to scale the estimate down, and whether the guard helps.

Arms per tile x SNR x scenario (noise drawn as ``tools/noise_aware_ramp_refit.py`` draws it):

- ``D``: the directional demosaic (what ships without a profile);
- ``true``: the blend with the true model, carried as the developer carries a profile (the oracle);
- ``fit@s``: the blend with ``estimate_noise`` (one pair, white-balanced plane) times s^2 (s scales sigma);
- ``planes@s``: the same fit per colour (``_colour_block_spread`` + ``_noise_model``), each pair times s^2;
- ``guard@s``: ``fit@s`` through ``guard_profile`` (capped at 1.25x what the cleanest bin shows).

All arms use the shipped ramps (``RAMPS`` colour, ``LUMA_RAMPS`` luma). SNR 200 is in the default set as a near-
clean case: there the estimate is mostly texture, and the blend must not soften detail.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python tools/noise_aware_estimated.py sweep [--bayer | --raf X-E1.raf] --cache /tmp/truths FILES... > rows.jsonl
    python tools/noise_aware_estimated.py fit rows.jsonl [--json fit.jsonl]
    python tools/noise_aware_estimated.py bucket --grain grain.jsonl rows.jsonl   # by added / scene noise

``bucket`` splits rows by the added noise's sigma at 18% grey over the clean tile's own in-frame reading
(``tools/noise_estimator_accuracy.py --clean``, ``haar2``): under 1 the reference's finest texture is louder
than the noise drawn on it, and no in-frame estimator can tell the two apart.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time

import numpy as np

SCALES = (0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.25)


def seed_of(*parts) -> int:
    return int(hashlib.sha1(repr(parts).encode()).hexdigest()[:8], 16)


def plane_estimate(c, pat) -> np.ndarray:
    """``estimate_noise`` per colour: (3, 2) (shot, read) rows R, G, B."""

    from shootflow.xtrans_demosaic import _colour_block_spread, _noise_model, _residual

    resid = _residual(c, pat)
    out = np.zeros((3, 2))
    for k in range(3):
        lv, sp = _colour_block_spread(c, pat, k, resid)
        ok = np.isfinite(lv) & np.isfinite(sp)
        out[k] = _noise_model(lv[ok], sp[ok])
    return out


def arms_for(c, pat, b, d, true_model, scales=SCALES, pcts=None, pca=False, pca_texture=None) -> dict:
    """Every arm's output (h, w, 3) for one noisy plane ``c``. With ``pcts`` (spread percentiles), only the
    ``fit`` and ``guard`` families, once per percentile, named ``fitP@s`` and ``guardP@s``. With ``pca``, the
    morning's ``frame_noise`` (``ship``: block spread, ``estimator="spread"``) and the patch-PCA estimate (``shootflow.noise_pca``) times s^2, bare
    (``pca@s``) and through ``guard_profile`` (``pcaguard@s``)."""

    from shootflow.xtrans_demosaic import estimate_noise, frame_noise, guard_profile, noise_aware

    out = {"D": d, "true": noise_aware(c, pat, bilinear=b, directional_out=d, noise=true_model)}
    if pca_texture:
        # one patch-PCA texture test only (``--pca-texture``; "near": eval/xtrans-noise-pca-12-2026-11-17.md),
        # arms ``pcaT@s`` and ``pcaTguard@s`` with T the test's first letter
        from shootflow.noise_pca import estimate_noise_pca

        t = pca_texture[0]
        est = np.array(estimate_noise_pca(c, pat, texture=pca_texture))
        for s in scales:
            f = tuple(est * s * s)
            out[f"pca{t}@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
            g, _ = guard_profile(c, pat, f)
            out[f"pca{t}guard@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
        return out
    if pca:
        from shootflow.noise_pca import estimate_noise_pca

        out["ship"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=frame_noise(c, pat, estimator="spread"))
        est = np.array(estimate_noise_pca(c, pat))
        for s in scales:
            f = tuple(est * s * s)
            out[f"pca@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
            g, _ = guard_profile(c, pat, f)
            out[f"pcaguard@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
        return out
    if pcts:
        for p in pcts:
            fit = np.array(estimate_noise(c, pat, pct=p))
            for s in scales:
                f = tuple(fit * s * s)
                out[f"fit{p:g}@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
                g, _ = guard_profile(c, pat, f)
                out[f"guard{p:g}@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
        return out
    fit = np.array(estimate_noise(c, pat))
    planes = plane_estimate(c, pat)
    for s in scales:
        f = tuple(fit * s * s)
        out[f"fit@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=f)
        out[f"planes@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=planes * s * s)
        g, _ = guard_profile(c, pat, f)
        out[f"guard@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
    return out


def features(c, pat) -> dict:
    """What the frame alone says about its own noise, for a scale picked per frame (``adapt``): sigma at 18%
    grey of the patch-PCA model (``pca18``) and of the block-spread model (``spread18``), both on ``c``'s
    scale, their ratio, and the share of patches PCA's weak-texture test kept (``kept``, free with the estimate), and ``noise_pca.whiteness`` (``white``: 0.5 for white noise, nearer 1 when
    the reading is texture). Texture inflates block spread far more than it inflates PCA's small eigenvalues,
    so ``ratio`` near 1 says the frame's spread is mostly noise and a high ratio says it is mostly texture."""

    from shootflow.noise_pca import estimate_noise_pca
    from shootflow.xtrans_demosaic import estimate_noise

    def s18(m):
        return math.sqrt(max(m[0] * 0.18 + m[1], 0.0))

    from shootflow.noise_pca import whiteness

    info: dict = {}
    m = estimate_noise_pca(c, pat, info=info)
    p, q = s18(m), s18(estimate_noise(c, pat))
    kept = info["kept"] / info["patches"] if info.get("patches") else None
    w = whiteness(c, pat, full=m)
    return {"pca18": round(p, 6), "spread18": round(q, 6), "ratio": round(q / p, 4) if p > 0 else None,
            "kept": round(kept, 4) if kept is not None else None, "white": round(w, 4) if w is not None else None}


def card_of(name: str, cards: dict | None) -> str:
    """The card a file belongs to: its body from ``tools/card_scenes.py`` output, else the file itself."""

    return cards[name]["card"] if cards and name in cards else name


def card_floor(path: str, cards: dict | None = None) -> dict:
    """The lowest patch-PCA sigma at 18% grey over every tile of one card at one SNR and scenario, from
    ``sweep --features-only`` rows. A card is one body's frames at one ISO, which share the sensor's noise and
    not the scene's texture. With ``cards`` (``tools/card_scenes.py``) a card is every kept scene of one body;
    without, the tiles of one file stand in for it."""

    out: dict = {}
    for line in open(path):
        f = json.loads(line)
        if "feat" not in f or not f["feat"].get("pca18"):
            continue
        k = (card_of(f["file"], cards), f["snr"], f["scenario"])
        out[k] = min(out.get(k, math.inf), f["feat"]["pca18"])
    return out


def cap_arms(c, pat, b, d, floor: float, scales=SCALES) -> dict:
    """``cap@s``: what ships (``pcaguard@0.8``: the frame's patch-PCA model at sigma x 0.8, guarded), with its
    sigma at 18% grey capped at s times the card's floor (``card_floor``): the floor only ever lowers a frame's
    model, and only where the frame reads far above its card. Where the cap does not bind the arm is
    ``pcaguard@0.8`` itself, reused, so only binding rows cost a blend. Arms ``D`` and ``pcaguard@0.8`` alongside."""

    from shootflow.noise_pca import estimate_noise_pca, sigma18
    from shootflow.xtrans_demosaic import guard_profile, noise_aware

    est = np.array(estimate_noise_pca(c, pat))
    ship = est * 0.64
    own = sigma18(tuple(ship))
    g, _ = guard_profile(c, pat, tuple(ship))
    out = {"D": d, "pcaguard@0.8": noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)}
    for s in scales:
        lim = s * floor
        if own <= lim or own <= 0:
            out[f"cap@{s:g}"] = out["pcaguard@0.8"]
            continue
        g, _ = guard_profile(c, pat, tuple(ship * (lim / own) ** 2))
        out[f"cap@{s:g}"] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
    return out


def card_arms(c, pat, b, d, true_model, floor: float, scales=SCALES) -> dict:
    """``card@s``: this frame's patch-PCA model rescaled so its sigma at 18% grey is s times ``floor`` (the
    card's lowest reading, ``card_floor``), then ``guard_profile``. ``pcaguard@0.8`` (what ships) and the oracle
    alongside."""

    from shootflow.noise_pca import estimate_noise_pca, sigma18
    from shootflow.xtrans_demosaic import guard_profile, noise_aware

    out = {"D": d, "true": noise_aware(c, pat, bilinear=b, directional_out=d, noise=true_model)}
    est = np.array(estimate_noise_pca(c, pat))
    own = sigma18(tuple(est))
    for name, f in [("pcaguard@0.8", est * 0.64)] + [
            (f"card@{s:g}", est * ((s * floor / own) ** 2 if own > 0 else 0.0)) for s in scales]:
        g, _ = guard_profile(c, pat, tuple(f))
        out[name] = noise_aware(c, pat, bilinear=b, directional_out=d, noise=g)
    return out


def sweep(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--raf")
    ap.add_argument("--bayer", action="store_true")
    ap.add_argument("--snr", type=float, action="append", default=None)
    ap.add_argument("--tile", type=int, default=480)
    ap.add_argument("--crops", type=int, default=3)
    ap.add_argument("--cache")
    ap.add_argument("--scenario", action="append", default=None, choices=("equal", "wb"))
    ap.add_argument("--pcts", help="comma-separated spread percentiles: fitP@s and guardP@s arms only")
    ap.add_argument("--scales", help="comma-separated sigma scales (default: SCALES)")
    ap.add_argument("--pca", action="store_true", help="arms D, true, ship, pca@s, pcaguard@s only")
    ap.add_argument("--pca-texture", choices=("grad", "colour", "near"),
                    help="arms D, true, pcaT@s, pcaTguard@s only: patch PCA with this texture test")
    ap.add_argument("--card", help="``--features-only`` rows: arms D, true, pcaguard@0.8 and card@s only (``card_arms``)")
    ap.add_argument("--cap", action="store_true",
                    help="with ``--card``: arms D, pcaguard@0.8 and cap@s only (``cap_arms``)")
    ap.add_argument("--cards", help="``tools/card_scenes.py`` output: skip repeat scenes, split tune/held by body, "
                    "and take ``--card`` floors over a body's scenes instead of one file's tiles")
    ap.add_argument("--features-only", action="store_true",
                    help="rows of ``features`` per noisy tile, no demosaic (``adapt --feats``: the same draws)")
    args = ap.parse_args(argv)
    snrs = args.snr or [200.0, 60.0, 25.0, 12.0]
    pcts = [float(x) for x in args.pcts.split(",")] if args.pcts else None
    scales = tuple(float(x) for x in args.scales.split(",")) if args.scales else SCALES
    scenarios = args.scenario or ["equal", "wb"]
    cards = json.load(open(args.cards)) if args.cards else None
    card = card_floor(args.card, cards) if args.card else None

    import rawpy

    sys.path.insert(0, __file__.rsplit("/", 1)[0])
    import xtrans_demosaic_check as chk
    from noise_aware_planes import carries, draw, gains_of
    from xtrans_frame_choice import _truth, split_of, tiles

    if args.bayer:
        from shootflow.bayer_demosaic import directional

        pat = (0, 1, 1, 2)
    else:
        from shootflow.xtrans_demosaic import directional

        pat = chk._pattern(rawpy.imread(args.raf))
    for path in args.files:
        name = path.rsplit("/", 1)[-1]
        if cards is not None and not cards.get(name, {}).get("keep"):
            continue  # a repeat of a scene already in the card, or a file card_scenes.py could not read
        try:
            truth_full = _truth(path, args.cache)
            gains = gains_of(path)
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"file": name, "skipped": f"{type(exc).__name__}: {exc}"}), flush=True)
            continue
        for (ty, tx), truth in tiles(truth_full, args.tile, args.crops):
            clean = chk.mosaic(truth, pat)
            for snr in snrs:
                for sc in scenarios:
                    t0 = time.perf_counter()
                    seed = seed_of(name, ty, tx, snr, sc)
                    if sc == "equal":
                        c = chk.add_noise(clean, snr, seed=seed)
                        sig2 = (0.18 / snr) ** 2
                        model = (0.8 * sig2 / 0.18, 0.2 * sig2)
                    else:
                        c, raw_model = draw(clean, pat, gains, snr, ((1.0, 1.0),) * 3, seed)
                        model, _ = carries(raw_model, gains)
                    if args.features_only:
                        from shootflow.noise_pca import sigma18

                        print(json.dumps({"file": name, "card": card_of(name, cards), "tile": [ty, tx], "snr": snr,
                                          "scenario": sc, "true18": round(sigma18(tuple(model)), 6),
                                          "feat": features(c, pat)}), flush=True)
                        continue
                    b = chk.ours_bilinear(c, pat)
                    d = directional(c, pat)
                    cps, lps = {}, {}
                    feat = features(c, pat) if args.pca else None
                    floor = card[(card_of(name, cards), snr, sc)] if card else None
                    arms = (cap_arms(c, pat, b, d, floor, scales) if card and args.cap else
                            card_arms(c, pat, b, d, model, floor, scales) if card else
                            arms_for(c, pat, b, d, model, scales, pcts, args.pca, args.pca_texture))
                    for arm, arr in arms.items():
                        s = chk.scores(arr, truth)
                        cps[arm], lps[arm] = s["cpsnr"], s["lpsnr"]
                    print(json.dumps({
                        "layout": "bayer" if args.bayer else "xtrans", "file": name,
                        "split": split_of(card_of(name, cards)), **({"card": card_of(name, cards)} if cards else {}),
                        "tile": [ty, tx], "snr": snr, "scenario": sc, "cpsnr": cps, "lpsnr": lps,
                        **({"feat": feat} if feat else {}),
                        "s": round(time.perf_counter() - t0, 2),
                    }), flush=True)
    return 0


def gains(rows, metric: str, arm: str, ref: str = "D") -> np.ndarray:
    m = "cpsnr" if metric == "c" else "lpsnr"
    return np.array([r[m][arm] - r[m][ref] for r in rows])


def finite_nonneg(text: str) -> float:
    value = float(text)
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError(f"must be a finite number >= 0, got {text!r}")
    return value


def summary(g: np.ndarray) -> dict:
    return {"mean": round(float(g.mean()), 3), "worst": round(float(g.min()), 2),
            "worse_0.1": int((g < -0.1).sum()), "n": int(g.size)}


def fit(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--json")
    ap.add_argument("--max-worse", type=finite_nonneg, default=0.1, help="a tune row may lose at most this (dB) vs D, either metric")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    rows = [r for r in rows if "cpsnr" in r]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        lr = [r for r in rows if r["layout"] == layout]
        tune = [r for r in lr if r["split"] == "tune"]
        held = [r for r in lr if r["split"] == "held"]
        arms = [a for a in lr[0]["cpsnr"] if a != "D"]

        def ok(arm):
            return all(gains(tune, m, arm).min() >= -args.max_worse for m in ("c", "l"))

        def score(arm):
            return (gains(tune, "c", arm) + gains(tune, "l", arm)).mean()

        picks = {"true": "true"} if "true" in arms else {}  # a ``--cap`` sweep carries no oracle
        fams = sorted({a.split("@")[0] for a in arms if "@" in a})
        for fam in fams:
            fam_arms = [a for a in arms if a.split("@")[0] == fam]
            safe = [a for a in fam_arms if ok(a)]
            picks[fam] = max(safe, key=score) if safe else None
        print(f"## {layout}: {len(tune)} tune rows, {len(held)} held rows")
        for label, arm in picks.items():
            if arm is None:
                print(f"{label:7s} no arm keeps every tune row within {args.max_worse} dB of D")
                continue
            for setname, rs in (("tune", tune), ("held", held)):
                rec = {"layout": layout, "pick": label, "arm": arm, "set": setname,
                       "colour": summary(gains(rs, "c", arm)), "luma": summary(gains(rs, "l", arm))}
                for sc in sorted({r["scenario"] for r in rs}):
                    for snr in sorted({r["snr"] for r in rs}):
                        sub = [r for r in rs if r["scenario"] == sc and r["snr"] == snr]
                        rec[f"{sc} snr {snr:g}"] = {"colour": round(float(gains(sub, "c", arm).mean()), 3),
                                                    "luma": round(float(gains(sub, "l", arm).mean()), 3),
                                                    "worst": round(float(min(gains(sub, "c", arm).min(), gains(sub, "l", arm).min())), 2)}
                out.append(rec)
                print(f"{label:7s} {arm:12s} {setname}: colour {rec['colour']}  luma {rec['luma']}")
        for arm in arms:  # every arm on both sets, for the write-up's table
            rec = {"layout": layout, "arm": arm}
            for setname, rs in (("tune", tune), ("held", held)):
                for m, lab in (("c", "colour"), ("l", "luma")):
                    g = gains(rs, m, arm)
                    rec[f"{setname}_{lab}"] = round(float(g.mean()), 3)
                    rec[f"{setname}_{lab}_worst"] = round(float(g.min()), 2)
                    rec[f"{setname}_{lab}_worse_0.1"] = int((g < -0.1).sum())
            out.append(rec)
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


BUCKETS = ((0.0, 1.0, "<1"), (1.0, 2.0, "1-2"), (2.0, 4.0, "2-4"), (4.0, float("inf"), ">=4"))


def bucket(argv) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--grain", required=True, help="tools/noise_estimator_accuracy.py --clean rows")
    ap.add_argument("--key", default="haar2")
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    grain = {}
    for line in open(args.grain):
        g = json.loads(line)
        if args.key in g:
            grain[(g["file"], tuple(g["tile"]))] = g[args.key] / 1000.0  # stored as sigma x 1000
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    rows = [r for r in rows if "cpsnr" in r and (r["file"], tuple(r["tile"])) in grain]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        arms = [a for a in rows[0]["cpsnr"] if a != "D"]
        for split in ("tune", "held"):
            rs = [r for r in rows if r["layout"] == layout and r["split"] == split]
            print(f"## {layout} {split}: luma / colour gain over D, worst, rows worse than D by > 0.1 dB")
            for arm in arms:
                cells = []
                for lo, hi, lab in BUCKETS:
                    sub = [r for r in rs if lo <= (0.18 / r["snr"]) / grain[(r["file"], tuple(r["tile"]))] < hi]
                    if not sub:
                        continue
                    lg, cg = gains(sub, "l", arm), gains(sub, "c", arm)
                    rec = {"layout": layout, "split": split, "arm": arm, "bucket": lab, "n": len(sub),
                           "luma": round(float(lg.mean()), 3), "colour": round(float(cg.mean()), 3),
                           "worst": round(float(min(lg.min(), cg.min())), 2),
                           "worse_0.1": int(((lg < -0.1) | (cg < -0.1)).sum())}
                    out.append(rec)
                    cells.append(f"{lab:>3s} n{len(sub):3d} L{rec['luma']:+.2f} C{rec['colour']:+.2f} w{rec['worst']:+.2f} x{rec['worse_0.1']}")
                print(f"  {arm:12s} " + " | ".join(cells))
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


def adapt(argv) -> int:
    """Fit a per-frame scale on tune rows only: ``s_hi`` where the frame's own ``feat`` says its spread is mostly
    noise (``ratio`` or ``white`` at or under ``t``, or ``kept`` at or over ``t``), ``s_lo`` elsewhere, each arm the
    ``pcaguard@s`` of a ``sweep --pca`` row. The rule kept is the best tune mean of luma + colour gain over D among
    those with no tune row worse than D by over ``--max-worse`` dB in either metric; held rows are scored once,
    after the pick."""

    ap = argparse.ArgumentParser()
    ap.add_argument("rows", nargs="+")
    ap.add_argument("--max-worse", type=finite_nonneg, default=0.1)
    ap.add_argument("--family", default="pcaguard")
    ap.add_argument("--grain", help="tools/noise_estimator_accuracy.py --clean rows: held luma by bucket")
    ap.add_argument("--feats", action="append", default=[], help="``sweep --features-only`` rows: replace each row's feat")
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for p in args.rows for line in open(p) if line.strip()]
    key = lambda r: (r["file"], tuple(r["tile"]), r["snr"], r["scenario"])  # noqa: E731
    extra = {key(f): f["feat"] for p in args.feats for f in map(json.loads, filter(str.strip, open(p))) if "feat" in f}
    for r in rows:
        if "cpsnr" in r and key(r) in extra:
            r["feat"] = {**r.get("feat", {}), **extra[key(r)]}
    rows = [r for r in rows if "cpsnr" in r and r.get("feat")]
    out = []
    for layout in sorted({r["layout"] for r in rows}):
        lr = [r for r in rows if r["layout"] == layout]
        tune = [r for r in lr if r["split"] == "tune"]
        held = [r for r in lr if r["split"] == "held"]
        scales = sorted(float(a.split("@")[1]) for a in lr[0]["cpsnr"] if a.startswith(args.family + "@"))

        def arm(s):
            return f"{args.family}@{s:g}"

        def high(r, rule):
            feat, t = rule[0], rule[1]
            if feat == "const":
                return False
            v = r["feat"].get(feat)
            return v is not None and (v >= t if feat == "kept" else v <= t)

        def per_row(rs, rule):
            """(luma, colour) gains over D of each row under ``rule`` = (feature, t, s_lo, s_hi)."""
            lg, cg = [], []
            for r in rs:
                a = arm(rule[3] if high(r, rule) else rule[2])
                lg.append(r["lpsnr"][a] - r["lpsnr"]["D"])
                cg.append(r["cpsnr"][a] - r["cpsnr"]["D"])
            return np.array(lg), np.array(cg)

        rules = [("const", 0.0, s, s) for s in scales]
        for feat in ("ratio", "kept", "white"):
            vals = np.array([r["feat"][feat] for r in tune if r["feat"].get(feat) is not None])
            if vals.size == 0:
                continue
            for t in sorted(set(np.round(np.quantile(vals, np.linspace(0.05, 0.95, 19)), 4))):
                for lo in scales:
                    for hi in scales:
                        if hi > lo:
                            rules.append((feat, float(t), lo, hi))
        scored = []
        for rule in rules:
            lg, cg = per_row(tune, rule)
            if min(lg.min(), cg.min()) >= -args.max_worse:
                scored.append(((lg + cg).mean(), rule))
        if not scored:
            print(f"## {layout}: no rule keeps every tune row within {args.max_worse} dB of D")
            continue
        best_const = max((x for x in scored if x[1][0] == "const"), key=lambda x: x[0], default=None)
        best = max(scored, key=lambda x: x[0])
        print(f"## {layout}: {len(tune)} tune / {len(held)} held rows; {len(scored)} of {len(rules)} rules safe on tune")
        picks = [("pick", best[1])] + ([("const", best_const[1])] if best_const else [])
        picks += [(f"{args.family}@0.8", ("const", 0.0, 0.8, 0.8))] if 0.8 in scales else []
        for label, rule in picks:
            for setname, rs in (("tune", tune), ("held", held)):
                lg, cg = per_row(rs, rule)
                tl, tc = gains(rs, "l", "true"), gains(rs, "c", "true")
                rec = {"layout": layout, "label": label, "rule": list(rule), "set": setname,
                       "luma": summary(lg), "colour": summary(cg),
                       "true_luma": round(float(tl.mean()), 3), "true_colour": round(float(tc.mean()), 3),
                       "high_share": round(float(np.mean([high(r, rule) for r in rs])), 3) if rs else None}
                if args.grain and setname == "held":
                    grain = {}
                    for line in open(args.grain):
                        g = json.loads(line)
                        if "haar2" in g:
                            grain[(g["file"], tuple(g["tile"]))] = g["haar2"] / 1000.0
                    for lo_b, hi_b, lab in BUCKETS:
                        sub = [r for r in rs if (r["file"], tuple(r["tile"])) in grain
                               and lo_b <= (0.18 / r["snr"]) / grain[(r["file"], tuple(r["tile"]))] < hi_b]
                        if sub:
                            sl, sc_ = per_row(sub, rule)
                            rec[f"bucket {lab}"] = {"n": len(sub), "luma": round(float(sl.mean()), 3),
                                                    "true_luma": round(float(gains(sub, "l", "true").mean()), 3),
                                                    "worst": round(float(min(sl.min(), sc_.min())), 2),
                                                    "worse_0.1": int(((sl < -0.1) | (sc_ < -0.1)).sum())}
                out.append(rec)
                print(f"{label:14s} {str(rule):34s} {setname}: luma {rec['luma']} colour {rec['colour']} "
                      f"(true {rec['true_luma']:+.3f} / {rec['true_colour']:+.3f})")
                for k, v in rec.items():
                    if k.startswith("bucket"):
                        print(f"{'':16s}{k}: {v}")
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


def floors(argv) -> int:
    """How far one frame's patch-PCA reading and its card's floor sit from the true sigma at 18% grey, from
    ``sweep --features-only --cards`` rows (they carry ``true18``). Prints, per SNR and per card size (scenes
    in the card), the median and 90th percentile of reading / truth for the frame's own reading and for the
    card floor, and the share of rows the floor understates (ratio < 1)."""

    ap = argparse.ArgumentParser()
    ap.add_argument("feats")
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    rows = [json.loads(line) for line in open(args.feats) if line.strip()]
    rows = [r for r in rows if r.get("feat", {}).get("pca18") and r.get("true18")]
    floor: dict = {}
    scenes: dict = {}
    for r in rows:
        k = (r["card"], r["snr"], r["scenario"])
        floor[k] = min(floor.get(k, math.inf), r["feat"]["pca18"])
        scenes.setdefault(r["card"], set()).add(r["file"])
    out = []

    def stats(v):
        v = np.array(v)
        return {"median": round(float(np.median(v)), 3), "p90": round(float(np.percentile(v, 90)), 3),
                "max": round(float(v.max()), 3), "under": round(float((v < 1).mean()), 3), "n": int(v.size)}

    for snr in sorted({r["snr"] for r in rows}, reverse=True):
        for size, lab in ((1, "1 scene"), (2, "2 scenes"), (3, "3+ scenes")):
            sub = [r for r in rows if r["snr"] == snr and min(len(scenes[r["card"]]), 3) == size]
            if not sub:
                continue
            rec = {"snr": snr, "card": lab,
                   "own": stats([r["feat"]["pca18"] / r["true18"] for r in sub]),
                   "floor": stats([floor[(r["card"], r["snr"], r["scenario"])] / r["true18"] for r in sub])}
            out.append(rec)
            print(f"SNR {snr:>5g} {lab:9s} own {rec['own']}\n{'':19s}floor {rec['floor']}")
    if args.json:
        with open(args.json, "w") as f:
            for rec in out:
                f.write(json.dumps(rec) + "\n")
    return 0


if __name__ == "__main__":
    cmd, rest = sys.argv[1], sys.argv[2:]
    sys.exit({"sweep": sweep, "fit": fit, "bucket": bucket, "adapt": adapt, "floors": floors}[cmd](rest))
