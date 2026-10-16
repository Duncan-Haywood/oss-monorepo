"""Re-run named projects serially with a long limit. Usage: python3 experiments/rerun_timeouts.py TIMEOUT_SECONDS slug [slug ...]"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from swe_audit.audit import run_project  # noqa: E402

RESEARCH = os.path.abspath(os.path.join(HERE, "..", ".."))
timeout = int(sys.argv[1])
print(f"serial re-run, timeout {timeout} s each, one project at a time\n")
print(f"{'project':28s} {'status':12s} {'difflines':>9s} {'secs':>7s}")
for slug in sys.argv[2:]:
    r = run_project(RESEARCH, slug, timeout)
    print(f"{r['slug']:28s} {r['status']:12s} {r['diff_lines']:9d} {r['seconds']:7.1f}", flush=True)
    if r["error"]:
        print(f"{'':28s}   last stderr line: {r['error']}", flush=True)
