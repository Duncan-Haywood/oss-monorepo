#!/usr/bin/env python3
"""Wait for a background command to finish, without `sleep` or the process list.

Cloud sessions block foreground `sleep` and `pgrep -f`, and Monitor loops were
reported blocked too (review prompt, cloud-session.md). Start the job with
`run_in_background`, `echo DONE` as its last output line, then:

    python3 platform/ci/wait_for.py out.log            # waits up to 100 s
    python3 platform/ci/wait_for.py out.log --marker END --timeout 60

A job that prints no marker (a `pip install`, a writer of a jsonl) can be waited on by
a condition instead: `--until "python3 -c 'import torch'"` returns 0 once that command exits 0.

Exit 0 and the log's last lines once the marker line appears; exit 1 on timeout
(the job may still run: call again). The default stays under the 120 s tool limit.
Do not pipe it (`| tail`) or chain `&& echo DONE`: a pipe hides the exit 1 and the chained echo fires falsely
(friction 2026-10-29); read the log file afterwards instead.
"""
import argparse, os, subprocess, sys, time


def wait(path, marker="DONE", timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep):
    end = clock() + timeout
    while True:
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = f.read().splitlines()
            if any(l.strip() == marker for l in lines):
                return True, lines
        if clock() >= end:
            return False, []
        nap(interval)


def wait_until(cmd, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep, run=subprocess.call):
    end = clock() + timeout
    while True:
        if run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
            return True
        if clock() >= end:
            return False
        nap(interval)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("log", nargs="?")
    ap.add_argument("--until", help="shell command; wait until it exits 0 (no log needed)")
    ap.add_argument("--marker", default="DONE")
    ap.add_argument("--timeout", type=float, default=100.0)
    a = ap.parse_args(argv)
    if a.until:
        if wait_until(a.until, a.timeout):
            print("wait_for: condition met")
            return 0
        print(f"wait_for: '{a.until}' still failing after {a.timeout:.0f}s; call again", file=sys.stderr)
        return 1
    if not a.log:
        ap.error("give a log file or --until")
    ok, lines = wait(a.log, a.marker, a.timeout)
    if not ok:
        print(f"wait_for: no '{a.marker}' line in {a.log} after {a.timeout:.0f}s; still running? call again", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
