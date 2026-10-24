"""Cross-check the run records against git history on main. Prints results.txt. Needs a full (unshallow) clone."""
import glob, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_reccover.cover import (LOG_FORMAT, parse_log, landed_prs, trailer_sessions, record_session, claim_check,
                                window_start, coverage, track_of, orphan_records, wilson)

REF = os.environ.get("REF", "origin/main")
if subprocess.run(["git", "-C", ROOT, "rev-parse", "--is-shallow-repository"], capture_output=True, text=True).stdout.strip() == "true":
    sys.exit("shallow clone: run `git fetch --unshallow origin main` first")
commits = parse_log(subprocess.run(["git", "-C", ROOT, "log", REF, "--format=" + LOG_FORMAT], capture_output=True, text=True, check=True).stdout)
records = []
for f in sorted(glob.glob(os.path.join(ROOT, "prompts", "runs", "*.json"))):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict):
        records.append(r)
landed, sessions = landed_prs(commits), trailer_sessions(commits)
recorded = {record_session(r) for r in records} - {None}


def pct(k, n):
    lo, hi = wilson(k, n)
    return f"{100 * k / n:5.1f}% ({100 * lo:.1f}-{100 * hi:.1f})" if n else "n/a"


print(f"commits on {REF} {len(commits)}   PRs landed (squash or merge subject) {len(landed)}   sessions with a Claude-Session trailer {len(sessions)}   records {len(records)}")

print("\n== A. records that name a pull request in this repository: is it on main? (k/n, Wilson 95%)")
by, missing = claim_check(records, landed)
for o, (k, n) in sorted(by.items(), key=lambda kv: -kv[1][1]):
    print(f"  outcome {o!s:8s}{k:5d}/{n:<5d} {pct(k, n)}")
print(f"  claimed but not on main: {len(missing)} {missing[:20]}")
print(f"  records naming a pull request in the retired research repository (not checkable here): {sum(1 for r in records if 'oss-research-monorepo' in str(r.get('pr')))}")

since = window_start(sessions, recorded)
print(f"\n== B. landed sessions that have a record, from {since} (first day with 20+ recorded landed sessions)")
tot = coverage(sessions, recorded, since, lambda e: ["all"])["all"]
print(f"  all sessions            {tot[0]:5d}/{tot[1]:<5d} {pct(*tot)}")
bt = coverage(sessions, recorded, since, track_of)
for t, (k, n) in sorted(bt.items(), key=lambda kv: -kv[1][1]):
    print(f"  {t:23s}{k:5d}/{n:<5d} {pct(k, n)}")
routed = coverage(sessions, recorded, since, lambda e: ["with Prompt-Version" if e["versions"] else "without Prompt-Version"])
print("  (a session can carry several tracks' trailers, so track rows can overlap)")
for t, (k, n) in routed.items():
    print(f"  {t:23s}{k:5d}/{n:<5d} {pct(k, n)}")

print("\n== C. coverage by day of landed sessions (day  sessions  recorded%)")
for d, (k, n) in sorted(coverage(sessions, recorded, since, lambda e: [e["date"]]).items()):
    print(f"  {d}  {n:5d}  {100 * k / n:5.1f}")

print(f"\n== D. records dated {since} or later whose session has no Claude-Session trailer on main")
for o, (k, n) in sorted(orphan_records(records, sessions, since).items(), key=lambda kv: -kv[1][1]):
    print(f"  outcome {o!s:8s}{k:5d}/{n:<5d} {pct(k, n)}")
