"""Summarise bias.jsonl and rows.json. Stdlib only.

    python experiments/analyse.py     # writes results.txt"""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
CHUNK = 1000
STALL_LOSS = 10      # rows del@122 loses per run


def load(name="bias.jsonl"):
    return [json.loads(l) for l in open(os.path.join(HERE, name))]


def is_truncation(first):
    """First 'mismatch' at chunk-relative index CHUNK-STALL_LOSS: fewer output rows than vectors, not a wrong value."""
    return first is not None and first % CHUNK == CHUNK - STALL_LOSS


def p_upper(trials, conf=0.95):
    return 1 - (1 - conf) ** (1.0 / trials)


def main():
    rows = load()
    nvec = rows[0]["nvec"]
    gens = list(rows[0]["first"])
    rc = json.load(open(os.path.join(HERE, "rows.json")))
    out = [f"== A. biased draws: {len(rows)} targets x {len(gens)} generators x {nvec} vectors"]
    for g in gens:
        real = [r for r in rows if r["first"][g] is not None and not is_truncation(r["first"][g])]
        trunc = [r for r in rows if is_truncation(r["first"][g])]
        out.append(f"{g}: real mismatches {len(real)}, truncated runs {[r['id'] for r in trunc]}")
        for r in real:
            out.append(f"  caught {r['id']} (formal={r['formal']}) at vector {r['first'][g]}")
    eq = [r for r in rows if r["formal"] == "equivalent"]
    out.append(f"equivalent-by-formal mutants caught by any biased generator: "
               f"{sum(any(v is not None and not is_truncation(v) for v in r['first'].values()) for r in eq)} of {len(eq)}")
    out.append(f"per-generator 95% upper bound on detection probability for a clean target: {p_upper(nvec):.2e}")
    out.append("")
    out.append(f"== B. {rc['id']}: {rc['rows']} output rows for {rc['vectors']} vectors")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
