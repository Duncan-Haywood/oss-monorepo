"""Summarise draws.jsonl: how many survivors the deep draw caught, and what the clean vectors rule out. Stdlib only.

    python experiments/analyse.py     # writes results.txt"""
import json, os
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
PRIOR = 20 * 64          # clean vectors per survivor already drawn in eda-verify
CHUNK = 2000
STALL_LOSS = 10          # rows missing at the end of the del@122 run, both in eda-verify (64 -> 54) and here


def load(path=os.path.join(HERE, "draws.jsonl")):
    return [json.loads(l) for l in open(path)]


def p_upper(trials, conf=0.95):
    """Upper confidence bound on a per-vector detection probability after `trials` clean vectors."""
    return 1 - (1 - conf) ** (1.0 / trials)


def is_truncation(r):
    """A first 'mismatch' at nvec-chunk-relative index CHUNK-STALL_LOSS means the simulation returned fewer rows than
    vectors (the checker returns the row count), not a wrong output."""
    return r["first"] is not None and r["first"] % CHUNK == CHUNK - STALL_LOSS


def main():
    rows = load()
    nvec = rows[0]["nvec"]
    real = [r for r in rows if r["first"] is not None and not is_truncation(r)]
    trunc = [r for r in rows if is_truncation(r)]
    clean = [r for r in rows if r["first"] is None]
    by = Counter((r["formal"], "caught" if r in real else "truncated" if r in trunc else "clean") for r in rows)
    out = [f"== A. deep random draw: {len(rows)} survivors of 64-vector random testing x {nvec} vectors each (one shared vector stream)"]
    for k, v in sorted(by.items()):
        out.append(f"formal={k[0]} {k[1]}: {v}")
    out.append(f"real mismatches found: {len(real)}")
    out.append(f"truncated runs (fewer output rows than vectors): {[(r['id'], r['first']) for r in trunc]}")
    out.append("")
    out.append("== B. per-vector detection probability that the clean vectors still allow (95% upper bound), per clean survivor")
    out.append("clean_vectors bound")
    for n in [0, 2000, 5000, 10000, 20000]:
        out.append(f"{n + PRIOR} {p_upper(n + PRIOR):.6f}")
    out.append("")
    out.append(f"clean survivors: {len(clean)}; clean vectors each: {PRIOR + nvec}; bound {p_upper(PRIOR + nvec):.2e}")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
