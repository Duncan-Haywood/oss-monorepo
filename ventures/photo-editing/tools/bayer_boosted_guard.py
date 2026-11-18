"""Guarded boosted Bayer weight: four fallbacks to the linear B, chosen on CV, then scored on test and fresh.

``eval/bayer-boosted-guard-2026-11-16.md`` (pre-registered there before any score). The boosted model of
``tools/bayer_boosted_weight.py`` beats B on average but falls below 3/16 on one held-out camera (the
K-1 II). This scores four guards (frame-level range checks on feature means, a per-sensel clamp around B,
the average of the two) five-fold by frame, chooses one by the note's rule, and scores it once on the ten
test frames and on fresh frames no earlier note used.

Usage (from ``ventures/photo-editing``; needs rawpy and lightgbm)::

    PYTHONPATH=src:tools python tools/bayer_boosted_guard.py --train <40 files> --test <10 files> \\
        --fresh <fresh files> --cache DIR --noise-snr 50 --noise-snr 25 > guard.jsonl
    python tools/bayer_boosted_guard.py --pick-fresh <candidate files>   # the note's fresh-set rule
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys

import numpy as np

CANDIDATES = ("C0", "C1a", "C1b", "C2", "C3")
ORDER = ("C3", "C2", "C1a", "C1b")  # simplest first, for ties
CLAMP = 1.0 / 64.0
FEATURE5 = 5
BASE = 8
MEAN_BAR, FLOOR_BAR, TIE = 0.02, -0.05, 0.005


def frame_stats(f: dict) -> np.ndarray:
    """Means of the eight base features over the copy's red and blue sensels (no truth read)."""

    return np.asarray(f["X"][:, :BASE], np.float64).mean(0)


def ranges(copies: list[dict]) -> tuple[np.ndarray, np.ndarray]:
    s = np.stack([frame_stats(f) for f in copies])
    return s.min(0), s.max(0)


def candidates(T: np.ndarray, B: np.ndarray, stats: np.ndarray, lo: np.ndarray, hi: np.ndarray) -> dict:
    """Weight maps of every candidate for one copy (clipping to [1/8, 1/4] happens in ``gain``)."""

    out_f5 = not (lo[FEATURE5] <= stats[FEATURE5] <= hi[FEATURE5])
    out_any = bool(np.any((stats < lo) | (stats > hi)))
    return {
        "C0": T,
        "C1a": B if out_f5 else T,
        "C1b": B if out_any else T,
        "C2": B + np.clip(T - B, -CLAMP, CLAMP),
        "C3": 0.5 * (T + B),
    }, {"fallback_f5": out_f5, "fallback_any": out_any}


def choose(rows: list[dict]) -> tuple[str | None, dict]:
    """The note's rule: eligible if mean >= linear + 0.02 and the worst frame (mean of its copies of
    candidate - linear) >= -0.05; highest mean wins, ties within 0.005 go to the simplest."""

    lin = float(np.mean([r["cv_gain_linear"] for r in rows]))
    summary = {}
    for c in ORDER:
        mean = float(np.mean([r[f"cv_gain_{c}"] for r in rows]))
        frames: dict[str, list[float]] = {}
        for r in rows:
            frames.setdefault(r["group"], []).append(r[f"cv_gain_{c}"] - r["cv_gain_linear"])
        worst_name, worst = min(((k, float(np.mean(v))) for k, v in frames.items()), key=lambda kv: kv[1])
        summary[c] = {"mean": round(mean, 4), "linear": round(lin, 4), "worst_frame": worst_name,
                      "worst_frame_delta": round(worst, 4),
                      "eligible": mean >= lin + MEAN_BAR and worst >= FLOOR_BAR}
    ok = [c for c in ORDER if summary[c]["eligible"]]
    if not ok:
        return None, summary
    best = max(summary[c]["mean"] for c in ok)
    return next(c for c in ok if summary[c]["mean"] >= best - TIE), summary


def verdict(rows: list[dict], key: str) -> dict:
    """The note's test bars for one set: mean >= B + 0.02, no frame below B by more than 0.05, beats B on
    at least 60% of copies."""

    d = np.array([r[key] - r["gain_B"] for r in rows])
    frames: dict[str, list[float]] = {}
    for r, x in zip(rows, d):
        frames.setdefault(r["group"], []).append(float(x))
    per_frame = {k: round(float(np.mean(v)), 4) for k, v in frames.items()}
    worst = min(per_frame.values())
    wins = int(np.sum(d > 0))
    mean_c, mean_b = float(np.mean([r[key] for r in rows])), float(np.mean([r["gain_B"] for r in rows]))
    return {"mean": round(mean_c, 4), "mean_B": round(mean_b, 4), "worst_frame_delta": round(worst, 4),
            "wins": wins, "copies": len(rows), "per_frame_delta": per_frame,
            "pass": mean_c >= mean_b + MEAN_BAR and worst >= FLOOR_BAR and wins >= 0.6 * len(rows)}


def pick_fresh(paths: list[str]) -> list[str]:
    """The note's fresh-set rule: rawpy reads a 2 x 2 Bayer (one red, two greens, one blue) of at least
    6 million sensels; one file per EXIF model, first in sorted path order."""

    import rawpy

    from bayer_demosaic_check import binned_truth

    seen, keep = set(), []
    for p in sorted(paths):
        why = None
        try:
            with rawpy.imread(p) as r:
                pat = np.asarray(r.raw_pattern) if r.raw_pattern is not None else None
                desc = r.color_desc.decode(errors="replace")
                n = r.raw_image_visible.size
                if pat is None or pat.shape != (2, 2):
                    why = f"pattern {None if pat is None else pat.shape}"
                else:
                    cols = sorted(desc[int(i)] for i in pat.ravel())
                    if cols != ["B", "G", "G", "R"]:
                        why = f"colours {''.join(cols)}"
                    elif n < 6_000_000:
                        why = f"{n} sensels"
        except Exception as e:  # unreadable by this LibRaw
            why = f"rawpy: {type(e).__name__}"
        if why is None:
            model = _model(p)
            if model in seen:
                why = f"second file of {model}"
            else:
                try:
                    binned_truth(p)
                except Exception as e:
                    why = f"binned_truth: {type(e).__name__}"
        print(json.dumps({"fresh_candidate": p, "model": _model(p) if why is None else None,
                          "in": why is None, "why_not": why}), flush=True)
        if why is None:
            seen.add(model)
            keep.append(p)
    return keep


def _model(path: str) -> str:
    """The EXIF model the sample set's own metadata dump records for ``path``
    (``<folder>/metadata/{java,dotnet}/<file>.txt``, line ``... Model = X``); the file name if none."""

    d, name = os.path.split(path)
    for sub in ("java", "dotnet"):
        meta = os.path.join(d, "metadata", sub, name + ".txt")
        if os.path.exists(meta):
            for line in open(meta, encoding="utf-8", errors="replace"):
                m = re.match(r"\[[^\]]*0x0110\] Model = (.+)", line.strip())
                if m:
                    return m.group(1).strip()
    return name


def export(copies: list[dict], args) -> int:
    """Fit the final model (as the scored run does), flatten it, and compare numpy and lightgbm."""

    import time

    from bayer_boosted_weight import fit_boosted, load_copies

    from shootflow import tree_ensemble as te

    model = fit_boosted(copies)
    lo, hi = ranges(copies)
    del copies
    flat = te.from_lightgbm_dump(model.dump_model())
    te.save(flat, args.export)
    info = {"export": args.export, "trees": int(flat.roots.size), "nodes": int(flat.feature.size),
            "depth": flat.depth, "train_lo": lo.round(6).tolist(), "train_hi": hi.round(6).tolist()}
    if args.test:
        f = load_copies(args.test[:1], args.cache, [], None, kind="test")[0]
        X = f["X"]
        t0 = time.perf_counter()
        a = model.predict(X, num_threads=0)
        t1 = time.perf_counter()
        b = te.predict(flat, X)
        t2 = time.perf_counter()
        info.update(copy=f["name"], sensels=int(X.shape[0]), max_abs_diff=float(np.max(np.abs(a - b))),
                    lightgbm_s=round(t1 - t0, 2), numpy_s=round(t2 - t1, 2))
    print(json.dumps(info), flush=True)
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--train", nargs="+")
    ap.add_argument("--test", nargs="*", default=[])
    ap.add_argument("--fresh", nargs="*", default=[])
    ap.add_argument("--cache")
    ap.add_argument("--per-frame", type=int, default=200_000)
    ap.add_argument("--noise-snr", type=float, action="append", default=[])
    ap.add_argument("--pick-fresh", nargs="+")
    ap.add_argument("--export", metavar="NPZ",
                    help="skip CV and scoring: fit the final model on the training copies, save it as a "
                         "shootflow.tree_ensemble .npz, and time numpy against lightgbm on the first --test copy")
    args = ap.parse_args(argv)
    if args.pick_fresh:
        keep = pick_fresh(args.pick_fresh)
        print(json.dumps({"fresh_set": keep}), flush=True)
        return 0

    from bayer_boosted_weight import fit_boosted, fit_linear, gain, load_copies, predict_linear
    from bayer_laplace_train import TEST_FRAMES

    for p in args.train:
        if any(t in os.path.basename(p) for t in TEST_FRAMES):
            raise SystemExit(f"{p} is a test frame; it cannot train the model")
    copies = load_copies(args.train, args.cache, args.noise_snr, args.per_frame)
    if args.export:
        return export(copies, args)
    rows = []
    for k in range(5):
        train = [f for f in copies if f["fold"] != k]
        held = [f for f in copies if f["fold"] == k]
        model, coef = fit_boosted(train), fit_linear(train)
        lo, hi = ranges(train)
        for f in held:
            T, B = model.predict(f["X"], num_threads=0), predict_linear(coef, f)
            maps, flags = candidates(T, B, frame_stats(f), lo, hi)
            row = {"cv_copy": f["name"], "group": f["group"], "fold": k, "snr": f["snr"], **flags,
                   "cv_gain_linear": round(gain(f, B), 4), "gain_B_shipped": round(gain(f, f["wB"]), 4)}
            row.update({f"cv_gain_{c}": round(gain(f, w), 4) for c, w in maps.items()})
            rows.append(row)
            print(json.dumps(row), flush=True)
        print(f"fold {k} done", file=sys.stderr, flush=True)
    pick, summary = choose(rows)
    print(json.dumps({"cv_choice": pick, "cv_summary": summary}), flush=True)
    if pick is None or not (args.test or args.fresh):
        return 0
    model = fit_boosted(copies)
    lo, hi = ranges(copies)
    print(json.dumps({"train_ranges": {"lo": lo.round(5).tolist(), "hi": hi.round(5).tolist()}}), flush=True)
    del copies
    for kind, paths in (("test", args.test), ("fresh", args.fresh)):
        if not paths:
            continue
        out = []
        for f in load_copies(paths, args.cache, args.noise_snr, None, kind=kind):
            T = model.predict(f["X"], num_threads=0)
            maps, flags = candidates(T, f["wB"], frame_stats(f), lo, hi)
            row = {f"{kind}_copy": f["name"], "group": f["group"], "snr": f["snr"], **flags,
                   "sensels": int(len(f["gt"])), "gain_B": round(gain(f, f["wB"]), 4)}
            row.update({f"gain_{c}": round(gain(f, w), 4) for c, w in maps.items()})
            out.append(row)
            print(json.dumps(row), flush=True)
            del f
        print(json.dumps({f"{kind}_verdict": {pick: verdict(out, f"gain_{pick}"), "C0": verdict(out, "gain_C0")}}),
              flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
