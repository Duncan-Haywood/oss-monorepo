"""Any certified pilot point gives a ceiling, not only the pilot's best (milestone 97). Runs no flow.
Writes pilot_cert_anypoint_results.txt. Usage: python3 pilot_cert_anypoint.py

Milestone 96 proved: ratio(p) < 1 implies halving returns y <= y(p), and used p = the pilot's best point, certified only when T < 1.
The proof holds for every pilot point, so the ceiling is c = min y(p) over pilot points with ratio(p) < 1, and it exists whenever the
pilot holds at least one certified point, including pilots whose best point fails (T >= 1).
Predictions written before running (m = 16): (1) zero violations of returned <= c; (2) the share of pilots with a ceiling exceeds the
share with T < 1; (3) the extra pilots (T >= 1 but a ceiling) have a larger mean excess of c over the pool minimum than the T < 1 pilots."""
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import bound, flow  # noqa: E402
from pilot_rho import ratio, ETA, PILOTS  # noqa: E402

DRAWS = 50


def measure(m, by, pilots=PILOTS, draws=DRAWS):
    npil = nt = nany = viol = tot = 0
    exc_t = exc_x = reg_t = reg_x = 0.0
    dt = dx = 0
    for tag in ("tight", "relaxed"):
        for d in flow.DESIGNS:
            sc = by[(tag, d)]
            n = len(sc)
            y = [s["r4"] for s in sc]
            best = min(y)
            s = {g: [p[g] for p in sc] for g in ("r1", "r2", "r3")}
            keep = [max(1, n // ETA), max(1, n // ETA ** 2), max(1, n // ETA ** 3)]
            for rungs, kp in ((("r1", "r2", "r3"), keep), (("r2", "r3"), keep[:2])):
                rs = [ratio(s, rungs, kp, i, n) for i in range(n)]
                rng = random.Random(f"prho{tag}{d}{m}{len(rungs)}")
                rh = random.Random(f"any{tag}{d}{m}{len(rungs)}")
                for _ in range(pilots):
                    pts = rng.sample(range(n), m)
                    npil += 1
                    top = min(pts, key=lambda i: y[i])
                    is_t = rs[top] < 1
                    nt += is_t
                    cert = [i for i in pts if rs[i] < 1]
                    if not cert:
                        continue
                    nany += 1
                    c = min(y[i] for i in cert)
                    for _ in range(draws):
                        got = bound.halve([s[g] for g in rungs], y, kp, rh)
                        tot += 1
                        viol += got > c + 1e-12
                    if is_t:
                        exc_t += c / best - 1; dt += 1
                    else:
                        exc_x += c / best - 1; dx += 1
    return dict(m=m, pilots=npil, t_lt1=nt / npil, ceiling=nany / npil, viol=viol, draws=tot,
                exc_t=exc_t / dt, exc_x=exc_x / dx if dx else float("nan"), extra=dx)


if __name__ == "__main__":
    rows = [json.loads(l) for l in (HERE.parent / "rung_bias" / "results.jsonl").read_text().splitlines()]
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(flow.scores(r))
    out = ["m | pilots | share with T<1 | share with any certified point | violations of returned<=ceiling | draws | extra pilots (T>=1 with ceiling) | mean excess of ceiling, T<1 pilots | mean excess of ceiling, extra pilots"]
    for m in (8, 16, 24):
        r = measure(m, by)
        out.append(f"{m} | {r['pilots']} | {r['t_lt1']:.3f} | {r['ceiling']:.3f} | {r['viol']} | {r['draws']} | {r['extra']} | {r['exc_t']:.4f} | {r['exc_x']:.4f}")
    (HERE / "pilot_cert_anypoint_results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))
