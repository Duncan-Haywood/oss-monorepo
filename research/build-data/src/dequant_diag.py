"""Milestone 7g diagnostic: when does the dequantised CQR variant lose coverage? Stdlib only.
Reads results/prior_table3_cov_2024.json (milestone 7f) and tabulates, per city/target/model,
the sign of the dequantised qhat against the change in coverage from the raw interval.
  python3 src/dequant_diag.py"""
import json, os
here = os.path.dirname(os.path.abspath(__file__))
rows = json.load(open(os.path.join(here, "..", "results", "prior_table3_cov_2024.json")))
print("city target model: dq_qhat, raw_cov -> dq_cov (delta)")
neg, pos = [], []
for r in rows:
    for m, v in r["models"].items():
        q, rc, dc = v["dequantised"]["qhat"], v["raw_coverage"], v["dequantised"]["coverage"]
        (neg if q < 0 else pos).append(dc - rc)
        print(f'{r["city"]} {r["target"]} {m}: {q:+.2f}, {rc:.3f} -> {dc:.3f} ({dc-rc:+.3f})')
print(f"qhat<0: n={len(neg)}, deltas {[round(d,3) for d in neg]}, all negative: {all(d<0 for d in neg)}")
print(f"qhat>=0: n={len(pos)}, min delta {min(pos):+.3f}")
