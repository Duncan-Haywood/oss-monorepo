"""Milestone 6q: paired excess at size 2, H = 64, keep 1/12 (omega 11) vs uncompressed, seeds 0 to 3. Reads scale.jsonl.
Usage: python3 keep12_6q.py"""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
c = {}
for l in open(os.path.join(HERE, "scale.jsonl")):
    r = json.loads(l); c.setdefault((r["H"], round(r["keep"], 6)), {})[r["seed"]] = r["loss"]
for k in (0.125, 1 / 12, 0.0625):
    d, b = c[(64, round(k, 6))], c[(64, 1.0)]
    s = sorted(set(d) & set(b)); x = [d[i] - b[i] for i in s]; mu = sum(x) / len(x)
    se = (sum((v - mu) ** 2 for v in x) / (len(x) - 1)) ** .5 / len(x) ** .5
    print(f"omega {1/k-1:.0f}: seeds {s} excess {mu:+.4f} se {se:.4f} per-seed {[round(v,4) for v in x]}")
