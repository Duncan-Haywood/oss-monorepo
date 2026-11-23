"""`mpcws` on its own ramps against what ships, on a fresh seeded draw from the full HDR+ set.

The ramp refit (``eval/hdrplus-ramp-fit-2026-11-22.md``) found the shipped noise read and the shipped blend ramps
are one calibration: with each read on the ramps picked for it on tune bursts, the oracle's losses to what ships
went from 14 to 0. It committed the next question: ``mpcws`` with colour ramp (0.3, 1.0) and luma ramp (1.0, 2.0)
(its tune pick) against ``frame_noise`` as it ships on the shipped ramps (0.4, 1.2) / (0.8, 1.5), on bursts no
photo-editing score has used, under the four tests of the dB sweep's R1. The rule is in
``eval/hdrplus-joint-check-2026-11-22.md``, committed before any burst was scored.

``draw`` lists the full set (``storage.googleapis.com/hdrplusdata/20171106``, 3,640 bursts) through the JSON API,
drops every burst of the 153-burst subset the earlier notes used, and writes a seeded sample.
``prep`` is ``tools/hdrplus_ramp_fit.py prep`` with ``--bucket`` (no ``--m-default``: a burst without both
NoiseProfiles is skipped, so ``m`` is measured on every scored burst).
``score`` blends each scene for the arms below, ``judge`` applies the rule.

Usage (from ``ventures/photo-editing``, numpy and rawpy installed)::

    python tools/hdrplus_joint_check.py draw --n 240 --seed 20261122 > IDS.txt
    PYTHONPATH=src python tools/hdrplus_ramp_fit.py prep --bursts IDS.txt --out SCENES \\
        --bucket https://storage.googleapis.com/hdrplusdata/20171106
    PYTHONPATH=src python tools/hdrplus_joint_check.py score SCENES/*.npz > rows.jsonl
    python tools/hdrplus_joint_check.py judge rows.jsonl
    # J2, the second draw:
    python tools/hdrplus_joint_check.py draw --n 240 --seed 20261123 \
        --exclude eval/hdrplus-joint-check-bursts-2026-11-22.txt > IDS2.txt
    # J3, the third draw (arm `j3`: colour ramp (0.3, 1.0), shipped luma ramp, collapse fallback; h4o):
    python tools/hdrplus_joint_check.py draw --n 240 --seed 20261124 \
        --exclude eval/hdrplus-joint-check-bursts-2026-11-22.txt eval/hdrplus-joint-check-bursts2-2026-11-22.txt > IDS3.txt
    # J4, the fourth draw (arm `j4`: `j3` with the collapse line at 0.6):
    python tools/hdrplus_joint_check.py draw --n 240 --seed 20261125 \
        --exclude eval/hdrplus-joint-check-bursts-2026-11-22.txt eval/hdrplus-joint-check-bursts2-2026-11-22.txt \
        eval/hdrplus-joint-check-bursts3-2026-11-22.txt > IDS4.txt
    # J5, the fifth draw (arm `j5`: `j3` with the collapse test on mpcws's own shot share at 18% grey):
    python tools/hdrplus_joint_check.py draw --n 240 --seed 20261126 \
        --exclude eval/hdrplus-joint-check-bursts-2026-11-22.txt eval/hdrplus-joint-check-bursts2-2026-11-22.txt \
        eval/hdrplus-joint-check-bursts3-2026-11-22.txt eval/hdrplus-joint-check-bursts4-2026-11-23.txt > IDS5.txt
"""

from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

API = "https://storage.googleapis.com/storage/v1/b/hdrplusdata/o"
FULL, SUBSET = "20171106", "20171106_subset"
SHIP_C, SHIP_L = (0.4, 1.2), (0.8, 1.5)  # RAMPS[2], LUMA_RAMPS[2] as of 2026-11-22
K = 12.0
# (name, noise read, colour ramp, luma ramp); "candidate" against "ship" is the committed question,
# the rest are reported only
ARMS = (
    ("ship", "ship", SHIP_C, SHIP_L),
    ("candidate", "mpcws", (0.3, 1.0), (1.0, 2.0)),
    ("mpcws_shipped", "mpcws", SHIP_C, SHIP_L),
    ("ship_pick", "ship", (0.3, 1.0), (1.2, 2.0)),
    ("true_shipped", "true", SHIP_C, SHIP_L),
    ("true_pick", "true", (0.2, 0.8), (0.8, 1.5)),
    ("candidate_floor", "mpcws_floor", (0.3, 1.0), (1.0, 2.0)),
    # J3 (committed 2026-11-22 before the third draw): the candidate's colour ramp, the shipped luma ramp
    ("colour_only", "mpcws", (0.3, 1.0), SHIP_L),
)
# J2's arm (committed before the second draw): `candidate`, except where the mpcws read collapses (under
# COLLAPSE x the shipped read's sigma at 18% grey), where it is exactly `ship` (read and ramps)
COLLAPSE = 0.25
# J4 (committed in eval/hdrplus-joint-check-j3-2026-11-22.md before the fourth draw): `j3` with the line at 0.6
COLLAPSE_J4 = 0.6
# J5 (committed in eval/hdrplus-joint-check-j5-2026-11-23.md before the fifth draw): `j3`'s arm, but the collapse
# test reads the `mpcws` model alone. A collapsed read moves the noise from the shot term into the read term, so
# the shot term's share of the variance at 18% grey, s*0.18 / (s*0.18 + r), falls; under SHOT_SHARE_J5 it is `ship`.
# It needs no ISO, white level or second read, so it means the same on a camera raw as on a phone burst.
SHOT_SHARE_J5 = 0.5
FLOOR = 0.5  # mpcws_floor: the mpcws read, or the shipped read where mpcws reads under FLOOR x its sigma at 18% grey


def shot_share(model) -> float:
    """The shot term's share of the model's variance at 18% grey (0 when the model reads no noise at all)."""

    shot, read = max(float(model[0]) * 0.18, 0.0), max(float(model[1]), 0.0)
    return shot / (shot + read) if shot + read > 0 else 0.0


def collapsed_j5(models: dict, line: float = SHOT_SHARE_J5) -> bool:
    return shot_share(models["mpcws"]) < line


def sigma18(model) -> float:
    return float(max(model[0] * 0.18 + model[1], 0.0) ** 0.5)


def floored(models: dict) -> tuple:
    """The `mpcws` read, unless it collapses under ``FLOOR`` times the shipped read's sigma at 18% grey (added
    2026-11-22 after the first draw: both J1 h4 bursts were frames where `mpcws` read ~0 noise)."""

    m, s = tuple(models["mpcws"]), tuple(models["ship"])
    return s if sigma18(m) < FLOOR * sigma18(s) else m


# ---- draw ----

def list_bursts(root: str) -> list[str]:
    prefix = f"{root}/results_20171023/"
    out, token = [], None
    while True:
        q = {"prefix": prefix, "delimiter": "/", "maxResults": "1000"}
        if token:
            q["pageToken"] = token
        with urllib.request.urlopen(f"{API}?{urllib.parse.urlencode(q)}", timeout=60) as r:
            page = json.loads(r.read())
        out += [p[len(prefix):].strip("/") for p in page.get("prefixes", [])]
        token = page.get("nextPageToken")
        if not token:
            return sorted(out)


def draw(args) -> int:
    full, used = list_bursts(FULL), set(list_bursts(SUBSET))
    for f in args.exclude or []:
        used |= {x.strip() for x in Path(f).read_text().splitlines() if x.strip()}
    pool = [b for b in full if b not in used]
    pick = sorted(random.Random(args.seed).sample(pool, args.n))
    print(f"full set {len(full)}, subset {len(used)}, pool {len(pool)}, drawn {len(pick)} (seed {args.seed})",
          file=sys.stderr)
    print("\n".join(pick))
    return 0


# ---- score ----

def score_scene(path: Path) -> list[dict]:
    import hdrplus_demosaic_sweep as sw
    import xtrans_demosaic_check as chk

    from shootflow import xtrans_demosaic as xd
    from shootflow.bayer_demosaic import directional

    z = np.load(path)
    meta = json.loads(str(z["meta"]))
    truth, c, keep = z["truth"].astype(np.float64), z["noisy"], z["keep"]
    pat = tuple(meta["pat"])
    b = chk.ours_bilinear(c, pat)
    d = directional(c, pat)
    base = {k: meta[k] for k in ("burst", "model", "iso", "m", "m_src", "true_sigma18")}
    rows = [{**base, "arm": "D", "scores": sw.masked_scores(d, truth, keep)}]
    q = {}
    for read in {a[1] for a in ARMS}:
        noise = floored(meta["models"]) if read == "mpcws_floor" else tuple(meta["models"][read])
        qb = xd.frame_measures(c, pat, b, d, noise=noise, blocks=True)["q_blocks"]
        q[read] = xd.lift_near_detail(qb, K)
    for name, read, cr, lr in ARMS:
        out = xd.blend(b, d, q[read], cr[0], cr[1], luma_ramp=lr)
        rows.append({**base, "arm": name, "scores": sw.masked_scores(out, truth, keep)})
    by = {r["arm"]: r["scores"] for r in rows}
    col = collapsed(meta["models"])
    rows.append({**base, "arm": "fallback", "collapsed": col, "scores": by["ship" if col else "candidate"]})
    # J3's committed arm: `colour_only`, or exactly `ship` where the mpcws read collapses
    rows.append({**base, "arm": "j3", "collapsed": col, "scores": by["ship" if col else "colour_only"]})
    col4 = collapsed(meta["models"], COLLAPSE_J4)
    rows.append({**base, "arm": "j4", "collapsed": col4, "scores": by["ship" if col4 else "colour_only"]})
    col5 = collapsed_j5(meta["models"])
    rows.append({**base, "arm": "j5", "collapsed": col5, "scores": by["ship" if col5 else "colour_only"],
                 "shot_share": {k: round(shot_share(meta["models"][k]), 4) for k in ("mpcws", "ship", "true")},
                 "slope": {k: float(meta["models"][k][0]) for k in ("mpcws", "ship", "true")}})
    return rows


def collapsed(models: dict, line: float = COLLAPSE) -> bool:
    return sigma18(models["mpcws"]) < line * sigma18(models["ship"])


def score(paths) -> int:
    for p in paths:
        t0 = time.perf_counter()
        for r in score_scene(Path(p)):
            print(json.dumps(r), flush=True)
        print(f"{Path(p).stem}: {time.perf_counter() - t0:.0f} s", file=sys.stderr, flush=True)
    return 0


# ---- judge ----

JUDGED = [a[0] for a in ARMS if a[0] != "ship"] + ["fallback", "j3", "j4", "j5"]
ORACLE = "true_pick"  # J3's h4o: a burst counts only if this arm is not also over 0.1 dB under ship

def judge_rows(rows: list[dict]) -> dict:
    """The committed rule (eval/hdrplus-joint-check-2026-11-22.md) on ``candidate`` against ``ship``."""

    t: dict = {}
    sigma, model, collapsed_n, collapsed4, collapsed5 = {}, {}, {}, {}, {}
    for r in rows:
        t.setdefault(r["burst"], {})[r["arm"]] = tuple(r["scores"])
        if r["arm"] == "fallback":
            collapsed_n[r["burst"]] = r["collapsed"]
        if r["arm"] == "j4":
            collapsed4[r["burst"]] = r["collapsed"]
        if r["arm"] == "j5":
            collapsed5[r["burst"]] = r["collapsed"]
        sigma[r["burst"]], model[r["burst"]] = r["true_sigma18"], r.get("model")
    bursts = sorted(t)
    s = np.array([sigma[b] for b in bursts])

    def gains(a, ref):
        g = np.array([[t[b][a][i] - t[b][ref][i] for i in (0, 1)] for b in bursts])
        return g[:, 0], g[:, 1]  # colour, luma

    cut = np.quantile(s, [1 / 3, 2 / 3])
    thirds = [s <= cut[0], (s > cut[0]) & (s <= cut[1]), s > cut[1]]
    sc, sl = gains("ship", "D")
    if all(ORACLE in t[b] for b in bursts):
        oc, ol = gains(ORACLE, "ship")
        oracle_worse = (oc < -0.1) | (ol < -0.1)
    else:
        oracle_worse = np.zeros(len(bursts), bool)
    ship_lose = (sc < -0.1) | (sl < -0.1)
    out: dict = {"bursts": len(bursts), "models": {}, "collapsed": sorted(b for b, v in collapsed_n.items() if v),
                 "collapsed_j4": sorted(b for b, v in collapsed4.items() if v),
                 "collapsed_j5": sorted(b for b, v in collapsed5.items() if v)}
    judged = [a for a in JUDGED if all(a in t[b] for b in bursts)]
    for b in bursts:
        out["models"][model[b] or "?"] = out["models"].get(model[b] or "?", 0) + 1
    for arm in judged:
        gc, gl = gains(arm, "ship")
        ac, al = gains(arm, "D")
        lose = (ac < -0.1) | (al < -0.1)
        worse = (gc < -0.1) | (gl < -0.1)
        cells = [(float(gl[m].mean()), float(gc[m].mean())) for m in thirds]
        res = {"colour": round(float(gc.mean()), 4), "luma": round(float(gl.mean()), 4),
               "median_luma": round(float(np.median(gl)), 4), "median_colour": round(float(np.median(gc)), 4),
               "thirds_luma_colour": [[round(a, 4), round(b, 4)] for a, b in cells],
               "worse": int(worse.sum()), "worse_bursts": [b for b, w in zip(bursts, worse) if w],
               "worst": round(float(min(gc.min(), gl.min())), 3),
               "losers_to_D": int(lose.sum()), "new_losers_to_D": int((lose & ~ship_lose).sum()),
               "ship_losers_to_D": int(ship_lose.sum())}
        res["tests"] = {
            "h1": bool(gl.mean() >= -0.005 and gc.mean() >= -0.005 and min(min(c) for c in cells) >= -0.02),
            "h2": bool(res["new_losers_to_D"] == 0 and res["losers_to_D"] <= res["ship_losers_to_D"]),
            "h3": bool(gl.mean() >= 0.02),
            "h4": bool(res["worse"] == 0),
            # J3 (committed before the third draw): h4 counted only where the oracle on its ramps does not also lose
            "h4o": bool(int((worse & ~oracle_worse).sum()) == 0),
        }
        res["worse_not_oracle"] = [b for b, w, o in zip(bursts, worse, oracle_worse) if w and not o]
        out[arm] = res
    return out


def judge(args) -> int:
    rows = [json.loads(x) for x in args.rows.read_text().splitlines() if x.strip()]
    out = judge_rows(rows)
    print(f"{out['bursts']} bursts scored; models {out['models']}")
    print(f"mpcws read collapsed (fallback to ship) on {len(out['collapsed'])}: {out['collapsed']}")
    if out["collapsed_j4"]:
        print(f"under the J4 line ({COLLAPSE_J4}) on {len(out['collapsed_j4'])}: {out['collapsed_j4']}")
    if out["collapsed_j5"]:
        print(f"under the J5 shot-share line ({SHOT_SHARE_J5}) on {len(out['collapsed_j5'])}: {out['collapsed_j5']}")
    for arm in [a for a in JUDGED if a in out]:
        r = out[arm]
        tag = "COMMITTED" if arm in ("candidate", "fallback", "j3", "j4", "j5") else "reported"
        print(f"\n## {arm} over ship ({tag})")
        print(f"  means colour {r['colour']:+.4f} luma {r['luma']:+.4f} (medians {r['median_colour']:+.4f} / "
              f"{r['median_luma']:+.4f}); thirds luma/colour "
              + "  ".join(f"{a:+.3f}/{b:+.3f}" for a, b in r["thirds_luma_colour"]))
        print(f"  bursts > 0.1 dB under ship: {r['worse']} (worst {r['worst']:+.3f}) {r['worse_bursts']}")
        print(f"  of those, where the oracle ({ORACLE}) does not also lose: {r['worse_not_oracle']}")
        print(f"  losers to D: {r['losers_to_D']} (new {r['new_losers_to_D']}; ship loses on {r['ship_losers_to_D']})")
        print("  " + ", ".join(f"{k} {'PASS' if v else 'FAIL'}" for k, v in r["tests"].items()))
    if args.json:
        args.json.write_text(json.dumps(out, indent=1) + "\n")
    return 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("draw")
    d.add_argument("--n", type=int, default=240)
    d.add_argument("--seed", type=int, default=20261122)
    d.add_argument("--exclude", nargs="*", help="files of burst ids already used (one per line)")
    s = sub.add_parser("score")
    s.add_argument("scenes", nargs="+")
    j = sub.add_parser("judge")
    j.add_argument("rows", type=Path)
    j.add_argument("--json", type=Path)
    args = ap.parse_args(argv)
    return {"draw": draw, "score": lambda a: score(a.scenes), "judge": judge}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
