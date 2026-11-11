#!/usr/bin/env python3
"""Wait for a background command to finish, without `sleep` or the process list.

Cloud sessions block foreground `sleep` and `pgrep -f`, and Monitor loops were
reported blocked too (review prompt, cloud-session.md). Start the job with
`run_in_background`, `echo DONE` as its last output line, then:

    python3 platform/ci/wait_for.py out.log            # waits up to 100 s
    python3 platform/ci/wait_for.py out.log --marker END --timeout 60

A job that prints no marker (a `pip install`, a writer of a jsonl) can be waited on by
a condition instead: `--until "python3 -c 'import torch'"` returns 0 once that command exits 0.

A job with a known pid: `--pid 12345` returns once that process has exited. Do not
use `--until "pgrep -f name"`: the shell running it matches its own command line, so it
returns at once (friction 2026-11-06); use `--pid`, or bracket the first letter, `'[n]ame'`.

`echo EXIT $?` works as a marker line too: `--marker EXIT` matches `EXIT 0`, and
the printed tail shows the job's exit code.

Exit 0 and the log's last lines once the marker line appears; exit 1 on timeout
(the job may still run: call again). The default stays under the 120 s tool limit.
For a job of many minutes, start wait_for itself with `run_in_background --timeout 3600`;
the harness wakes you when it exits.
Do not pipe it (`| tail`) or chain `&& echo DONE`: a pipe hides the exit 1 and the chained echo fires falsely
(friction 2026-10-29); read the log file afterwards instead.
"""
import argparse, os, subprocess, sys, time


def is_marker(line, marker):
    """The marker alone, or as the line's first word: `--marker EXIT` matches
    `EXIT 0` (an `echo EXIT $?` line), `DONE` matches `DONE in 42 s`. A marker
    inside a line (`not DONE yet`) does not count (friction 2026-11-11: `--marker
    EXIT` waited its full 540 s timeout on a log that ended `EXIT 0`)."""
    s = line.strip()
    return s == marker or (s.startswith(marker) and s[len(marker)] in " \t:")


def wait(path, marker="DONE", timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep):
    end = clock() + timeout
    while True:
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = f.read().splitlines()
            if any(is_marker(l, marker) for l in lines):
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


def pid_alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    try:  # a zombie has exited but not been reaped
        with open(f"/proc/{pid}/stat") as f:
            return f.read().rsplit(")", 1)[1].split()[0] != "Z"
    except OSError:
        return True


def wait_pid(pid, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep, alive=pid_alive):
    end = clock() + timeout
    while alive(pid):
        if clock() >= end:
            return False
        nap(interval)
    return True


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("log", nargs="?")
    ap.add_argument("--until", help="shell command; wait until it exits 0 (no log needed)")
    ap.add_argument("--pid", type=int, help="wait until this process id has exited")
    ap.add_argument("--marker", default="DONE")
    ap.add_argument("--timeout", type=float, default=100.0)
    a = ap.parse_args(argv)
    # An empty marker matches the first blank line, a false "done"; os.kill(-1, 0)
    # probes every process and os.kill(0, 0) the process group, so neither ends.
    if not a.marker.strip():
        ap.error("--marker must not be empty")
    if a.pid is not None and a.pid <= 0:
        ap.error("--pid must be a positive process id")
    if a.pid:
        if wait_pid(a.pid, a.timeout):
            print(f"wait_for: pid {a.pid} has exited")
            return 0
        print(f"wait_for: pid {a.pid} still running after {a.timeout:.0f}s; call again", file=sys.stderr)
        return 1
    if a.until:
        if wait_until(a.until, a.timeout):
            print("wait_for: condition met")
            return 0
        print(f"wait_for: '{a.until}' still failing after {a.timeout:.0f}s; call again", file=sys.stderr)
        return 1
    if not a.log:
        ap.error("give a log file, --until or --pid")
    ok, lines = wait(a.log, a.marker, a.timeout)
    if not ok:
        print(f"wait_for: no '{a.marker}' line in {a.log} after {a.timeout:.0f}s; still running? call again", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
