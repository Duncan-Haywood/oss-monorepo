#!/usr/bin/env python3
"""Wait for a background command to finish, without `sleep` or the process list.

Cloud sessions block foreground `sleep` and `pgrep -f`, and Monitor loops were
reported blocked too (review prompt, cloud-session.md). Start the job with
`run_in_background`, `echo DONE` as its last output line, then:

    python3 platform/ci/wait_for.py out.log            # waits up to 100 s
    python3 platform/ci/wait_for.py out.log --timeout 540   # up to 9 min: give the tool call timeout 600000
    python3 platform/ci/wait_for.py out.log --marker END --timeout 60   # --pattern works too

On a timeout it says how big the log is, how long since it was written and its
last line, so a live job is told apart from a stuck or silent one.

A job that prints no marker (a `pip install`, a writer of a jsonl) can be waited on by
a condition instead: `--until "python3 -c 'import torch'"` returns 0 once that command exits 0.

A job with a known pid: `--pid 12345` returns once that process has exited. Do not
use `--until "pgrep -f name"`: the shell running it matches its own command line, so it
returns at once (friction 2026-11-06); use `--pid`, or bracket the first letter, `'[n]ame'`.

`echo EXIT $?` works as a marker line too: with no `--marker`, a `DONE` line or an
`EXIT 0` line both end the wait (friction 2026-11-11: runs guessed `--pattern` or
waited out the timeout on an EXIT log), and the printed tail shows the exit code.
`--marker X` waits for X alone. The default also accepts the line the harness
ends a `run_in_background` task's own output file with, `[exited with code N]`,
so the file the task notification names can be waited on as it stands (a wait
on one ran its full 110 s past that line, 2026-11-12), and a `-` after the
marker (`DONE-EXIT 3`, friction 2026-11-12).

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
    return s == marker or (s.startswith(marker) and s[len(marker)] in " \t:-")


DEFAULT_MARKERS = ("DONE", "EXIT", "[exited with code")


def wait(path, marker=DEFAULT_MARKERS, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep):
    end = clock() + timeout
    while True:
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = f.read().splitlines()
            markers = (marker,) if isinstance(marker, str) else marker
            if any(is_marker(l, m) for l in lines for m in markers):
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


def progress(path, now=time.time):
    """What a timed-out wait can say about the job, so "call again" is not a guess.

    A bare "still running? call again" after 100 s was read as no progress, and
    once as a 10-minute interval that went into a README (friction 2026-11-11).
    Say how big the log is, how long since it was written and its last line:
    a log written seconds ago is a live job; one silent for many minutes may
    be stuck, or buffering its output until the end (also reported).
    """
    try:
        st = os.stat(path)
    except OSError:
        return "the log does not exist yet; check the job started and writes there, then call again"
    with open(path, errors="replace") as f:
        lines = [l for l in f.read().splitlines() if l.strip()]
    idle = max(0, now() - st.st_mtime)
    last = (lines[-1][:120] if lines else "(empty)")
    hint = ("still being written: call again" if idle < 60 else
            "silent for a while: the job may be stuck, or buffering its output (python3 -u); call again or check it")
    return f"log is {st.st_size} bytes, last written {idle:.0f}s ago, last line: {last!r}; {hint}"


def longer(timeout):
    """How to wait longer in one call. The 100 s default keeps a plain call under
    the tool's 120 s limit, but the tool takes up to 600 s, and three runs in
    three days waited out 100 s on a ~15 minute job without knowing --timeout
    existed (friction 2026-11-12)."""
    if timeout >= 540:
        return ""
    return "; to wait up to 9 min in one call, pass --timeout 540 and set the tool call's timeout to 600000 ms"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("log", nargs="?")
    ap.add_argument("--until", help="shell command; wait until it exits 0 (no log needed)")
    ap.add_argument("--pid", type=int, help="wait until this process id has exited")
    # `--pattern` is what runs guess first (four friction reports, 2026-11-10/11);
    # accepting it costs nothing and an argparse error costs a turn.
    ap.add_argument("--marker", "--pattern", dest="marker",
                    help="line (or first word) that means done; default DONE or EXIT")
    ap.add_argument("--timeout", type=float, default=100.0)
    a = ap.parse_args(argv)
    # An empty marker matches the first blank line, a false "done"; os.kill(-1, 0)
    # probes every process and os.kill(0, 0) the process group, so neither ends.
    if a.marker is not None and not a.marker.strip():
        ap.error("--marker must not be empty")
    if a.pid is not None and a.pid <= 0:
        ap.error("--pid must be a positive process id")
    if a.pid:
        if wait_pid(a.pid, a.timeout):
            print(f"wait_for: pid {a.pid} has exited")
            return 0
        print(f"wait_for: pid {a.pid} still running after {a.timeout:.0f}s; call again{longer(a.timeout)}", file=sys.stderr)
        return 1
    if a.until:
        if wait_until(a.until, a.timeout):
            print("wait_for: condition met")
            return 0
        print(f"wait_for: '{a.until}' still failing after {a.timeout:.0f}s; call again{longer(a.timeout)}", file=sys.stderr)
        return 1
    if not a.log:
        ap.error("give a log file, --until or --pid")
    ok, lines = wait(a.log, a.marker or DEFAULT_MARKERS, a.timeout)
    if not ok:
        shown = a.marker or "DONE' or 'EXIT"
        print(f"wait_for: no '{shown}' line in {a.log} after {a.timeout:.0f}s; {progress(a.log)}{longer(a.timeout)}", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
