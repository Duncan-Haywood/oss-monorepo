"""Milestone 11: successive halving from R2 with a random-search hedge, replayed on both cached tables.
Same cost model, pools, seeds and regret as milestones 3 and 9. Runs no flow.
Writes results.txt and summary.json. Usage: python3 replay.py"""
import json
import random
import statistics
import sys
import zlib
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1] / "src"))
from verified_dse import flow  # noqa: E402

M = statistics.mean
SEEDS = 400
TABLES = {
    "small": (HERE.parent / "rung_bias" / "results.jsonl", (10, 20, 30, 45), None),
    "large": (HERE.parent / "large" / "results.jsonl", (100, 200, 400, 600, 900),
              ["mult16", "mult24", "mult32", "adder_op64", "adder_ripple64"]),
}
STRATS = ["random_r4", "sh_r2", "sh_r2_eta2", "hedge50", "hedge75"]
RUNGS = ["r1", "r2", "r3", "r4"]


def costs(tight):
    return {
        "r2": M(r["t2_yosys"] + r["t_pnr_to_synth_netlist"] for r in tight),
        "r3": M(r["t_pnr_to_detail_place"] - r["t_pnr_to_synth_netlist"] for r in tight),
        "r4": M(r["t_pnr_total"] - r["t_pnr_to_detail_place"] for r in tight),
        "full": M(r["t2_yosys"] + r["t_pnr_total"] for r in tight),
    }


def sh_cost(C, n0, eta):
    n, total = n0, 0.0
    for k, rg in enumerate(("r2", "r3", "r4")):
        total += n * (C[rg] if k else C["r2"])
        n = max(1, n // eta)
    return total


def plan(C, B, eta, size):
    n0 = 0
    for n in range(1, size + 1):
        if sh_cost(C, n, eta) <= B:
            n0 = n
        else:
            break
    return n0


def run_sh(C, sc, ref, B, eta, rng):
    n0 = plan(C, B, eta, len(ref))
    if n0 == 0:
        return None
    cur = rng.sample(range(len(ref)), n0)
    keep = n0
    for k, rg in enumerate(("r2", "r3", "r4")):
        cur = sorted(cur, key=lambda i: (sc[i][rg], rng.random()))
        keep = max(1, keep // eta)
        if k < 2:
            cur = cur[:keep]
    return min(ref[i] for i in cur)


def random_r4(C, ref, B, rng):
    ids = list(range(len(ref)))
    rng.shuffle(ids)
    return min(ref[i] for i in ids[:max(int(B // C["full"]), 1)])


def hedge(C, sc, ref, B, f, rng):
    a = run_sh(C, sc, ref, B * f, 3, rng)
    b = random_r4(C, ref, B * (1 - f), rng) if B * (1 - f) >= C["full"] else None
    vals = [v for v in (a, b) if v is not None]
    return min(vals) if vals else None


def ci(x, rng):
    bs = sorted(M(rng.choices(x, k=len(x))) for _ in range(500))
    return bs[12], bs[487]


out, summary = [], {}
for name, (path, budgets, designs) in TABLES.items():
    rows = [json.loads(l) for l in path.read_text().splitlines()]
    tight = [r for r in rows if r["status"] == "ok" and r["tag"] == "tight"]
    C = costs(tight)
    by = defaultdict(list)
    for r in rows:
        if r["status"] == "ok":
            by[(r["tag"], r["design"])].append(r)
    ds = designs or sorted({d for _, d in by})
    out.append(f"# table {name}: {len(ds)} designs; cost model (s): r2 from scratch {C['r2']:.3f}, r3 {C['r3']:.3f}, r4 {C['r4']:.3f}, routed from scratch {C['full']:.3f}; {SEEDS} paired seeds\n")
    for tag in ("tight", "relaxed"):
        out.append(f"## {name}, clock {tag}: mean regret % over designs (wins/losses vs random_r4 by paired 95% CI; worst design)")
        out.append("budget s | " + " | ".join(STRATS))
        for B in budgets:
            cell = {s: [] for s in STRATS}
            wl = {s: [0, 0] for s in STRATS}
            for d in ds:
                pool = by[(tag, d)]
                sc = [flow.scores(r) for r in pool]
                ref = [x["r4"] for x in sc]
                lo = min(ref)
                reg = {s: [] for s in STRATS}
                for seed in range(SEEDS):
                    for s in STRATS:
                        rng = random.Random(seed * 7919 + zlib.crc32(d.encode()) % 1000)
                        if s == "random_r4":
                            v = random_r4(C, ref, B, rng)
                        elif s == "sh_r2":
                            v = run_sh(C, sc, ref, B, 3, rng)
                        elif s == "sh_r2_eta2":
                            v = run_sh(C, sc, ref, B, 2, rng)
                        else:
                            v = hedge(C, sc, ref, B, 0.5 if s == "hedge50" else 0.75, rng)
                        reg[s].append(None if v is None else (v / lo - 1) * 100)
                for s in STRATS:
                    if reg[s][0] is None:
                        continue
                    cell[s].append(M(reg[s]))
                    if s != "random_r4" and reg["random_r4"][0] is not None:
                        diff = [a - b for a, b in zip(reg[s], reg["random_r4"])]
                        l, h = ci(diff, random.Random(1))
                        wl[s][0] += h < 0
                        wl[s][1] += l > 0
                summary[f"{name}:{tag}:{B}:{d}"] = {s: (M(reg[s]) if reg[s][0] is not None else None) for s in STRATS}
            parts = []
            for s in STRATS:
                if len(cell[s]) < len(ds):
                    parts.append("n/a")
                elif s == "random_r4":
                    parts.append(f"{M(cell[s]):.2f} (worst {max(cell[s]):.1f})")
                else:
                    parts.append(f"{M(cell[s]):.2f} ({wl[s][0]}/{wl[s][1]}; worst {max(cell[s]):.1f})")
            out.append(f"{B} | " + " | ".join(parts))
        out.append("")
(HERE / "results.txt").write_text("\n".join(out) + "\n")
(HERE / "summary.json").write_text(json.dumps(summary, indent=1))
print("\n".join(out))
