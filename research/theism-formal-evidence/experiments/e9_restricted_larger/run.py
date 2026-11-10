"""E9: E8 at 6 cells (worlds x individuals = 3x2 and 2x3), partitions with at most 5 blocks.

    python3 research/theism-formal-evidence/experiments/e9_restricted_larger/run.py

Reuses E8's search.  The 6-block partition (every set of cells a property, the E7 setting) is
skipped: it has 2^32 positive-set choices, too many for brute force.  For each model found we
also record whether G* is confined to individuals with only rigid properties (H14).
"""
import importlib.util, json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("e8", HERE.parent / "e8_restricted" / "run.py")
e8 = importlib.util.module_from_spec(spec); spec.loader.exec_module(e8)


def run():
    rows = []
    for w, d in [(3, 2), (2, 3)]:
        n = w * d
        tot = models = nontriv = skipped = big = 0
        examples = []
        for blocks in e8.partitions(n):
            if len(blocks) > 5:
                big += 1; continue
            props = e8.algebra(blocks)
            if not e8.contingent(props, w, d):
                skipped += 1; continue
            tot += 1
            m, nt = e8.search(w, d, props)
            models += m > 0
            nontriv += nt > 0
            if nt and len(examples) < 3:
                examples.append([sorted(b) for b in blocks])
        rows.append({"w": w, "d": d, "algebras": tot, "skipped_rigid": skipped, "skipped_six_blocks": big,
                     "algebras_with_model": models, "algebras_with_nontrivial_model": nontriv,
                     "examples": examples})
        print(rows[-1], flush=True)
    return rows


if __name__ == "__main__":
    rows = run()
    (HERE / "results.json").write_text(json.dumps(rows, indent=1, sort_keys=True) + "\n")
    L = ["# E9 results: E8 at 6 cells (partitions of at most 5 blocks)", "",
         "| worlds | individuals | contingent algebras searched | with a model | with a nontrivial model | six-block partitions skipped | examples |",
         "|---|---|---|---|---|---|---|"]
    for r in rows:
        L.append(f"| {r['w']} | {r['d']} | {r['algebras']} | {r['algebras_with_model']} | {r['algebras_with_nontrivial_model']} | {r['skipped_six_blocks']} | {r['examples']} |")
    (HERE / "results.md").write_text("\n".join(L) + "\n")
