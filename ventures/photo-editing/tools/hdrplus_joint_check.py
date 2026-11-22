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
)
# J2's arm (committed before the second draw): `candidate`, except where the mpcws read collapses (under
# COLLAPSE x the shipped read's sigma at 18% grey), where it is exactly `ship` (read and ramps)
COLLAPSE = 0.25
FLOOR = 0.5  # mpcws_floor: the mpcws read, or the shipped read where mpcws reads under FLOOR x its sigma at 18% grey


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
    rows = [{**base, "arm": "D", "scores": sw.masked_scores(d, truth, keep)}]
    q = {}
    for read in {a[1] for a in ARMS}:
        noise = floored(meta["models"]) if read == "mpcws_floor" else tuple(meta["models"][read])
        qb = xd.frame_measures(c, pat, b, d, noise=noise, blocks=True)["q_blocks"]
        q[read] = xd.lift_near_detail(qb, K)
    for name, read, cr, lr in ARMS:
        out = xd.blend(b, d, q[read], cr[0], cr[1], luma_ramp=lr)
        rows.append({**base, "arm": name, "scores": sw.masked_scores(out, truth, keep)})
    rows.append({**base, "arm": "fallback", "collapsed": collapsed(meta["models"]),
                 "scores": rows[1 if collapsed(meta["models"]) else 2]["scores"]})
    return rows


def collapsed(models: dict) -> bool:
    return sigma18(models["mpcws"]) < COLLAPSE * sigma18(models["ship"])


def score(paths) -> int:
    for p in paths:
        t0 = time.perf_counter()
        for r in score_scene(Path(p)):
            print(json.dumps(r), flush=True)
        print(f"{Path(p).stem}: {time.perf_counter() - t0:.0f} s", file=sys.stderr, flush=True)
    return 0


# ---- judge ----

JUDGED = [a[0] for a in ARMS if a[0] != "ship"] + ["fallback"]

def judge_rows(rows: list[dict]) -> dict:
    """The committed rule (eval/hdrplus-joint-check-2026-11-22.md) on ``candidate`` against ``ship``."""

    t: dict = {}
    sigma, model, collapsed_n = {}, {}, {}
    for r in rows:
        t.setdefault(r["burst"], {})[r["arm"]] = tuple(r["scores"])
        if r["arm"] == "fallback":
            collapsed_n[r["burst"]] = r["collapsed"]
        sigma[r["burst"]], model[r["burst"]] = r["true_sigma18"], r.get("model")
    bursts = sorted(t)
    s = np.array([sigma[b] for b in bursts])

    def gains(a, ref):
        g = np.array([[t[b][a][i] - t[b][ref][i] for i in (0, 1)] for b in bursts])
        return g[:, 0], g[:, 1]  # colour, luma

    cut = np.quantile(s, [1 / 3, 2 / 3])
    thirds = [s <= cut[0], (s > cut[0]) & (s <= cut[1]), s > cut[1]]
    sc, sl = gains("ship", "D")
    ship_lose = (sc < -0.1) | (sl < -0.1)
    out: dict = {"bursts": len(bursts), "models": {}, "collapsed": sorted(b for b, v in collapsed_n.items() if v)}
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
        }
        out[arm] = res
    return out


def judge(args) -> int:
    rows = [json.loads(x) for x in args.rows.read_text().splitlines() if x.strip()]
    out = judge_rows(rows)
    print(f"{out['bursts']} bursts scored; models {out['models']}")
    print(f"mpcws read collapsed (fallback to ship) on {len(out['collapsed'])}: {out['collapsed']}")
    for arm in [a for a in JUDGED if a in out]:
        r = out[arm]
        tag = "COMMITTED" if arm in ("candidate", "fallback") else "reported"
        print(f"\n## {arm} over ship ({tag})")
        print(f"  means colour {r['colour']:+.4f} luma {r['luma']:+.4f} (medians {r['median_colour']:+.4f} / "
              f"{r['median_luma']:+.4f}); thirds luma/colour "
              + "  ".join(f"{a:+.3f}/{b:+.3f}" for a, b in r["thirds_luma_colour"]))
        print(f"  bursts > 0.1 dB under ship: {r['worse']} (worst {r['worst']:+.3f}) {r['worse_bursts']}")
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
