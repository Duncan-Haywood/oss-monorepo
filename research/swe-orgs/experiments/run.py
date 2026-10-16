"""Score the catalogue against the run ledger.  python experiments/run.py [prompts/runs dir or a runs.jsonl file] > results.txt"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[0] / "src"))
from swe_orgs.catalogue import read_csv, validate, error_texts, load_ledger, failure_shares, score, wilson  # noqa: E402

ledger = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE.parents[2] / "prompts" / "runs"
practices, sources = read_csv("practices.csv"), read_csv("sources.csv")
problems = validate(practices, sources)
rows = load_ledger(ledger)
sh = failure_shares(rows)
print(f"sources {len(sources)}, practices {len(practices)}, validation problems {len(problems)}")
for p in problems:
    print("  PROBLEM", p)
print(f"ledger rows {len(rows)}; rows with any reported error {sum(1 for r in rows if error_texts(r))}")
print("\nfailure class: rows matching / rows (Wilson 95%)")
for m, (k, n) in sh.items():
    lo, hi = wilson(k, n)
    print(f"  {m:13s} {k:3d}/{n} = {k/n:5.1%}  ({lo:5.1%} to {hi:5.1%})")
print("\npractice  transfer  status                                   target        ceiling  priority")
for r in score(practices, sh):
    print(f"  {r['id']:4s} {r['transfer']:8s} {r['status'][:40]:40s} {r['failure_mode']:12s} {r['ceiling']:6.1%}  {r['priority']:6.1%}")
print("\nopen candidates (transfer yes, not adopted, ceiling >= 5%):")
for r in score(practices, sh):
    if r["transfer"] == "yes" and not r["status"].startswith("adopted") and r["ceiling"] >= 0.05:
        print(f"  {r['id']} {r['practice']} [{r['source']}]")
