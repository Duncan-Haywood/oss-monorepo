#!/usr/bin/env python3
"""Wait for a background command to finish, without `sleep` or the process list.

Cloud sessions block foreground `sleep` and `pgrep -f`, and Monitor loops were
reported blocked too (review prompt, cloud-session.md). Start the job with
`run_in_background`, `echo DONE` as its last output line, then:

    python3 platform/ci/wait_for.py out.log            # waits up to 100 s
    python3 platform/ci/wait_for.py out.log --timeout 540   # up to 9 min: give the tool call timeout 600000
    python3 platform/ci/wait_for.py out.log --marker END --timeout 60   # --pattern works too

On a timeout it says how big the log is, how long since it was written, its
last line, and which process still has it open (none: the job exited without
its marker), so a live job is told apart from a quiet, stuck or dead one.

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
(the job may still run: call again); exit 2 when a restart killed it. The default stays under the 120 s tool limit.
For a job of many minutes, start wait_for itself with `run_in_background --timeout 3600`;
the harness wakes you when it exits.
A container restart kills every background job, mid-line and without a marker,
and reads like a hang: three restarts in one run on 2026-11-13 were taken for a
stuck build, `uptime` being the only tell. So a log last written before the
machine booted, with no marker, ends the wait at once (exit 2): the job that
wrote it is gone and must be started again (results it already saved survive).

Do not pipe it (`| tail`) or chain `&& echo DONE`: a pipe hides the exit 1 and the chained echo fires falsely
(friction 2026-10-29); read the log file afterwards instead.
"""
import argparse, os, subprocess, sys, time


def is_marker(line, marker):
    """The marker alone, or as the line's first word: `--marker EXIT` matches
    `EXIT 0` (an `echo EXIT $?` line), `DONE` matches `DONE in 42 s`. A marker
    inside a line (`not DONE yet`) does not count (friction 2026-11-11: `--marker
    EXIT` waited its full 540 s timeout on a log that ended `EXIT 0`). A marker
    that ends in `=` or `:` is a prefix: `rc=` matches `rc=0` (an `echo rc=$?`
    line; friction 2026-11-13, the same 540 s wait)."""
    s = line.strip()
    if marker[-1] in "=:" and s.startswith(marker):
        return True
    return s == marker or (s.startswith(marker) and s[len(marker)] in " \t:-")


DEFAULT_MARKERS = ("DONE", "EXIT", "[exited with code")


def boot_time(stat="/proc/stat"):
    """When this machine (the session's container) booted, as a Unix time; None if unknown."""
    try:
        with open(stat) as f:
            for line in f:
                if line.startswith("btime "):
                    return float(line.split()[1])
    except (OSError, ValueError, IndexError):
        pass
    return None


def wait(path, marker=DEFAULT_MARKERS, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep,
         boot=None, grace=20.0):
    """(True, lines) once a marker line appears; (False, []) on timeout; (None, lines)
    when the log was last written before `boot` (the machine's boot time) and stays
    so for `grace` seconds: the job died in a restart. The grace covers a job
    started after the boot that appends (`>>`) and has not written yet."""
    start = clock()
    end = start + timeout
    while True:
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = f.read().splitlines()
            markers = (marker,) if isinstance(marker, str) else marker
            if any(is_marker(l, m) for l in lines for m in markers):
                return True, lines
            if boot is not None and os.stat(path).st_mtime < boot and clock() - start >= min(grace, timeout):
                return None, lines
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


def holders(path, proc="/proc"):
    """[(pid, command)] of the processes that have `path` open; None when /proc can't say.

    The log's age alone could not tell a quiet job from a dead one: a job that
    prints only when it ends (an 18-minute benchmark, a `cmd > log` whose marker
    comes last) read "may be stuck" on every wait (two run records, 2026-11-14),
    and one that died before its `&& echo DONE` waited out the whole timeout.
    The shell redirect running a job holds its log open until the job exits, so
    an open file descriptor is the liveness signal `pgrep -f` can't give here.
    """
    try:
        target = os.path.realpath(path)
        pids = [d for d in os.listdir(proc) if d.isdigit()]
    except OSError:
        return None
    me, found = os.getpid(), []
    for pid in pids:
        if int(pid) == me:
            continue
        fd_dir = os.path.join(proc, pid, "fd")
        try:
            fds = os.listdir(fd_dir)
        except OSError:
            continue
        for fd in fds:
            try:
                if os.readlink(os.path.join(fd_dir, fd)) != target:
                    continue
            except OSError:
                continue
            try:
                with open(os.path.join(proc, pid, "cmdline"), "rb") as f:
                    cmd = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
            except OSError:
                cmd = ""
            found.append((int(pid), cmd or "?"))
            break
    return found


def progress(path, now=time.time, who=holders):
    """What a timed-out wait can say about the job, so "call again" is not a guess.

    A bare "still running? call again" after 100 s was read as no progress, and
    once as a 10-minute interval that went into a README (friction 2026-11-11).
    Say how big the log is, how long since it was written, its last line, and
    whether a process still has it open (alive, if quiet) or none does (the job
    has exited without its marker: read the log rather than wait again).
    """
    try:
        st = os.stat(path)
    except OSError:
        return "the log does not exist yet; check the job started and writes there, then call again"
    with open(path, errors="replace") as f:
        lines = [l for l in f.read().splitlines() if l.strip()]
    idle = max(0, now() - st.st_mtime)
    last = (lines[-1][:120] if lines else "(empty)")
    open_by = who(path)
    if open_by:
        pid, cmd = max(open_by)  # the newest holder is the job itself, not the shell that started it
        hint = (f"pid {pid} ({cmd[:60]!r}) still has it open, so the job is running"
                + ("" if idle < 60 else ", quietly (it may print only at the end, or buffer: python3 -u)")
                + "; call again")
    elif open_by is not None:
        hint = ("no process has it open any more, so the job has most likely exited without printing the marker "
                "(a failed `&&` before `echo DONE`?): read the log instead of waiting again, unless the job "
                "reopens it for each line (`>>` in a loop)")
    elif idle < 60:
        hint = "still being written: call again"
    else:
        hint = "silent for a while: the job may be stuck, or buffering its output (python3 -u); call again or check it"
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
    ap.add_argument("--ignore-restart", action="store_true",
                    help="keep waiting on a log last written before the container booted")
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
    boot = None if a.ignore_restart else boot_time()
    ok, lines = wait(a.log, a.marker or DEFAULT_MARKERS, a.timeout, boot=boot)
    if ok is None:
        last = next((l for l in reversed(lines) if l.strip()), "(empty)")[:120]
        when = time.strftime("%H:%M:%S UTC", time.gmtime(boot))
        written = time.strftime("%H:%M:%S UTC", time.gmtime(os.stat(a.log).st_mtime))
        print(f"wait_for: the container restarted at {when}, after {a.log} was last written ({written}), "
              f"and the log has no '{a.marker or 'DONE'}' line: the job that wrote it was killed, not stuck. "
              f"Start it again (files it already saved are still there). Last line: {last!r}. "
              f"(--ignore-restart waits anyway.)", file=sys.stderr)
        return 2
    if not ok:
        shown = a.marker or "DONE' or 'EXIT"
        print(f"wait_for: no '{shown}' line in {a.log} after {a.timeout:.0f}s; {progress(a.log)}{longer(a.timeout)}", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
