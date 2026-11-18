"""Score ``sweep --cap --floor-rank 1,2`` rows by the rule of eval/noise-card-floor-rank-2026-11-18.md.

On the rows of cards with three or more kept scenes (``--cards``, ``tools/card_scenes.py`` output), and again on
all rows: mean luma and colour gain over ``D`` per arm, rows worse than ``D`` by over 0.1 dB (luma or colour),
and whether ``cap2@1.5`` passes (a) within 0.01 dB of ``pcaguard@0.8`` on both means and (b) no more losing rows
than it, none of them new.

Usage (from ``ventures/photo-editing``)::

    python tools/card_floor_rule.py cap.jsonl --cards cards.json [--json out.json]
"""

from __future__ import annotations

import argparse
import collections
import json

import numpy as np

SHIP, ARMS = "pcaguard@0.8", ("pcaguard@0.8", "cap@1.5", "cap2@1.5")


def lose(r: dict, arm: str, by: float = 0.1) -> bool:
    return any(r[m][arm] - r[m]["D"] < -by for m in ("lpsnr", "cpsnr"))


def judge(rows: list, arm: str = "cap2@1.5") -> dict:
    out: dict = {"rows": len(rows)}
    for a in ARMS:
        out[a] = {"luma": round(float(np.mean([r["lpsnr"][a] - r["lpsnr"]["D"] for r in rows])), 4),
                  "colour": round(float(np.mean([r["cpsnr"][a] - r["cpsnr"]["D"] for r in rows])), 4),
                  "losing": sum(lose(r, a) for r in rows),
                  "worst": round(min(min(r[m][a] - r[m]["D"] for m in ("lpsnr", "cpsnr")) for r in rows), 3),
                  "binds": sum(r["lpsnr"][a] != r["lpsnr"][SHIP] or r["cpsnr"][a] != r["cpsnr"][SHIP] for r in rows)}
    s, c = out[SHIP], out[arm]
    new = sum(lose(r, arm) and not lose(r, SHIP) for r in rows)
    out["a"] = c["luma"] >= s["luma"] - 0.01 and c["colour"] >= s["colour"] - 0.01
    out["b"] = c["losing"] <= s["losing"] and new == 0
    out["new_losing"] = new
    out["pass"] = out["a"] and out["b"]
    return out


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("rows")
    ap.add_argument("--cards", required=True)
    ap.add_argument("--json")
    args = ap.parse_args(argv)
    cards = json.load(open(args.cards))
    scenes = collections.Counter(v["card"] for v in cards.values() if v["keep"])
    rows = [json.loads(line) for line in open(args.rows)]
    rows = [r for r in rows if "lpsnr" in r]
    big = [r for r in rows if scenes[r["card"]] >= 3]
    res = {"three_plus": judge(big), "all": judge(rows),
           "cards_three_plus": sum(n >= 3 for n in scenes.values()), "cards": len(scenes)}
    print(json.dumps(res, indent=1))
    if args.json:
        json.dump(res, open(args.json, "w"), indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
