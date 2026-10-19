"""Why do landed ventures sessions leave fewer run records? Prints results.txt. Needs a full (unshallow) clone."""
import glob, json, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..", "..", "..")
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_ventgap.gap import (LOG_FORMAT, parse_log, sessions, record_session, is_ventures, version_of, scope_of, size_of,
                             kind_of, rates, strata_by_day, mantel_haenszel_or, mentions_record_step, wilson)

REF, SINCE = os.environ.get("REF", "origin/main"), "2026-10-13"
if subprocess.run(["git", "-C", ROOT, "rev-parse", "--is-shallow-repository"], capture_output=True, text=True).stdout.strip() == "true":
    sys.exit("shallow clone: run `git fetch --unshallow origin main` first")
commits = parse_log(subprocess.run(["git", "-C", ROOT, "log", REF, "--name-only", "--format=" + LOG_FORMAT],
                                   capture_output=True, text=True, check=True).stdout)
recorded = set()
for f in glob.glob(os.path.join(ROOT, "prompts", "runs", "*.json")):
    try:
        r = json.load(open(f))
    except ValueError:
        continue
    if isinstance(r, dict):
        recorded.add(record_session(r))
recorded.discard(None)
allsess = {s: e for s, e in sessions(commits).items() if e["date"] >= SINCE}
ventures = {s: e for s, e in allsess.items() if is_ventures(e)}
research = {s: e for s, e in allsess.items() if {v.split("/")[0] for v in e["versions"] if "/" in v} == {"research"}}


def pct(k, n):
    lo, hi = wilson(k, n)
    return f"{100 * k / n:5.1f}% ({100 * lo:.1f}-{100 * hi:.1f})" if n else "n/a"


def table(title, sess, keyfn):
    print(f"\n{title}")
    for g, (k, n) in sorted(rates(sess, recorded, keyfn).items(), key=lambda kv: -kv[1][1]):
        print(f"  {g:26s}{k:5d}/{n:<5d} {pct(k, n)}")


def mh(label, sess, exposed, control, since=SINCE):
    o = mantel_haenszel_or(strata_by_day({s: e for s, e in sess.items() if e["date"] >= since}, recorded, exposed, control))
    print(f"  {label:44s} Mantel-Haenszel odds ratio of a record, matched by day: {'n/a' if o is None else f'{o:.2f}'}")


print(f"commits on {REF} {len(commits)}   records {len(recorded)}   landed sessions from {SINCE}: {len(allsess)}   ventures-only {len(ventures)}   research-only {len(research)}")

print("\n== A. landed sessions with a run record, from", SINCE, "(k/n, Wilson 95%)")
for name, g in (("ventures only", ventures), ("research only", research)):
    k = sum(s in recorded for s in g)
    print(f"  {name:26s}{k:5d}/{len(g):<5d} {pct(k, len(g))}")

table("== B1. ventures sessions by ventures prompt version", ventures, version_of)
table("== B2. ventures sessions by scope (venture directories touched)", ventures, scope_of)
table("== B3. ventures sessions by hand-written files touched (generated trees excluded)", ventures, size_of)
table("== B4. ventures sessions by first commit subject", ventures, kind_of)
table("== B5. ventures sessions by number of commits on main", ventures, lambda e: "1 commit" if e["commits"] == 1 else "2+ commits")

print("\n== C. ventures sessions by day (day  sessions  recorded%)")
for d, (k, n) in sorted(rates(ventures, recorded, lambda e: e["date"]).items()):
    print(f"  {d}  {n:5d}  {100 * k / n:5.1f}")

print("\n== D. odds of a record, matched by day (so a change in the mix over time cannot explain it)")
v1, v2 = (lambda e: "ventures/1" in e["versions"] and "ventures/2" not in e["versions"]), (lambda e: "ventures/2" in e["versions"])
mh("ventures/2 against ventures/1", ventures, v2, v1)
mh("ventures/1 against ventures/2 (reference)", ventures, v1, v2)
mh("research-only against ventures-only", {**ventures, **research}, lambda e: e in research.values(), lambda e: e in ventures.values())
mh("one venture against several ventures", ventures, lambda e: scope_of(e) == "one venture", lambda e: scope_of(e) == "several ventures")
mh("1-5 files against 21+ files", ventures, lambda e: size_of(e) == "1-5 files", lambda e: size_of(e) == "21+ files")
mh("venture feature subject against other subject", ventures, lambda e: kind_of(e) == "venture feature or fix", lambda e: kind_of(e) == "other subject")

print("\n== E. does the sub-prompt tell the reader to write the run record? (matches 'promptctl.py record' or 'run record')")
for f in sorted(glob.glob(os.path.join(ROOT, "prompts", "*", "prompt-*.md")) + [os.path.join(ROOT, "prompt.md")]):
    print(f"  {os.path.relpath(f, ROOT):36s}{'yes' if mentions_record_step(open(f).read()) else 'no'}")
