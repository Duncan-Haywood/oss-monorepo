"""Milestone 52: compare the proof table under Yosys 0.33 (results.jsonl, results_mult.jsonl) and 0.70 (results_y070.jsonl)."""
import json
from collections import defaultdict
from pathlib import Path
from statistics import median

H = Path(__file__).resolve().parent


def load(*names):
    rows = {}
    for n in names:
        for line in (H / n).read_text().splitlines():
            r = json.loads(line)
            if r.get("status") == "ok":
                rows[(r["design"], tuple(r["seq"]))] = r
    return rows


def main():
    old = load("results.jsonl", "results_mult.jsonl")
    new = load("results_y070.jsonl")
    out = [f"old (Yosys 0.33) ok points {len(old)}, new (0.70) {len(new)}, shared {len(set(old) & set(new))}",
           f"new: proved {sum(r['proved'] for r in new.values())}, counter-examples {sum(r['cex'] for r in new.values())}, "
           f"timed out {sum(r['timed_out'] for r in new.values())}"]
    by = defaultdict(list)
    for k in set(old) & set(new):
        by[k[0]].append(k)
    out.append("design: n, agree(proved<=3s), old proved<=1/3/10 s, new proved<=1/3/10 s, median t_sat old -> new, median cells diff")
    agree = tot = 0
    for d in sorted(by):
        ks = by[d]

        def c(rows, t):
            return sum(rows[k]["proved"] and rows[k]["t_sat"] <= t for k in ks)
        ag = sum((old[k]["proved"] and old[k]["t_sat"] <= 3) == (new[k]["proved"] and new[k]["t_sat"] <= 3) for k in ks)
        agree += ag
        tot += len(ks)
        cd = median(new[k]["cells"] - old[k]["cells"] for k in ks)
        out.append(f"  {d}: {len(ks)}, {ag}, {c(old,1)}/{c(old,3)}/{c(old,10)}, {c(new,1)}/{c(new,3)}/{c(new,10)}, "
                   f"{median(old[k]['t_sat'] for k in ks):.2f} -> {median(new[k]['t_sat'] for k in ks):.2f}, {cd}")
    out.append(f"label (proved within 3 s) agreement: {agree}/{tot} = {agree / tot:.3f}")
    (H / "compare_y070.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
