"""How large a pilot must be to yield a guaranteed ceiling (milestone 99). Runs no flow.
Writes pilot_cert_size_results.txt. Usage: python3 pilot_cert_size.py

Milestone 97 measured the ceiling c = min y over certified pilot points at m = 8, 16, 24 only. This sweeps m = 4 to 40 with the same
code, tables and pilot seeds (same random streams per m), 10 tie-breaks per pilot for the violation check.
Predictions written before running: (1) zero violations; (2) the share of pilots with a ceiling rises monotonically in m but stays below
0.6 at m = 40 (the share is capped by the cells where no point is certified at all); (3) the mean excess of the ceiling falls with m;
(4) the pilot size for a ceiling in half of pilots is above 24."""
import json
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402
from pilot_cert_anypoint import measure  # noqa: E402

SIZES = (4, 8, 12, 16, 24, 32, 40)

if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | pilots | share with T<1 | share with a ceiling | violations | draws | mean excess of ceiling over pool minimum, T<1 pilots | extra pilots"]
    for m in SIZES:
        r = measure(m, by, draws=10)
        out.append(f"{m} | {r['pilots']} | {r['t_lt1']:.3f} | {r['ceiling']:.3f} | {r['viol']} | {r['draws']} | {r['exc_t']:.4f} | {r['extra']}")
    (HERE / "pilot_cert_size_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
