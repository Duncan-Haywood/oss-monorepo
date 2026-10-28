#!/usr/bin/env python3
"""Wait for a background command to finish, without `sleep` or the process list.

Cloud sessions block foreground `sleep` and `pgrep -f`, and Monitor loops were
reported blocked too (review prompt, cloud-session.md). Start the job with
`run_in_background`, `echo DONE` as its last output line, then:

    python3 platform/ci/wait_for.py out.log            # waits up to 100 s
    python3 platform/ci/wait_for.py out.log --marker END --timeout 60

No DONE line (a jsonl, or a command that prints nothing)? `--quiet 20` returns
once the file is non-empty and has not grown for 20 s. Better: append
`; echo DONE` to the command.

Exit 0 and the log's last lines once the marker line appears; exit 1 on timeout
(the job may still run: call again). The default stays under the 120 s tool limit.
"""
import argparse, os, sys, time


def wait(path, marker="DONE", timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep, quiet=None):
    end = clock() + timeout
    last_size, last_change = -1, clock()
    while True:
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = f.read().splitlines()
            if quiet is None and any(l.strip() == marker for l in lines):
                return True, lines
            size = os.path.getsize(path)
            if size != last_size:
                last_size, last_change = size, clock()
            elif quiet is not None and size > 0 and clock() - last_change >= quiet:
                return True, lines
        if clock() >= end:
            return False, []
        nap(interval)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("log")
    ap.add_argument("--marker", default="DONE")
    ap.add_argument("--timeout", type=float, default=100.0)
    ap.add_argument("--quiet", type=float, help="done once the file stops growing for this many seconds")
    a = ap.parse_args(argv)
    ok, lines = wait(a.log, a.marker, a.timeout, quiet=a.quiet)
    if not ok:
        print(f"wait_for: no {'quiet period' if a.quiet else repr(a.marker)+' line'} in {a.log} after {a.timeout:.0f}s; still running? call again", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
