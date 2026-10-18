"""Draw the blind labelling sample: 60 of the error entries in swe-errors' snapshot, fixed seed, keyword label withheld.
python experiments/sample.py > data/to_label.tsv"""
import json, random, sys
from pathlib import Path
snap = Path(__file__).resolve().parents[2] / "swe-errors" / "experiments" / "errors_snapshot.jsonl"
entries = []
for i, line in enumerate(open(snap)):
    r = json.loads(line)
    for j, e in enumerate(r["errors"]):
        text = " ".join(str(v) for v in e.values()) if isinstance(e, dict) else str(e)
        entries.append((f"{i}.{j}", text.replace("\t", " ").replace("\n", " ")))
random.Random(20261018).shuffle(entries)
print(f"# {len(entries)} entries in snapshot; first 60 of a seeded shuffle", file=sys.stderr)
for eid, text in sorted(entries[:60]):
    print(f"{eid}\t{text}")
