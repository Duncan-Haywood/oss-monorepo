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
a condition instead: `--until "python3 -c 'import torch'"` returns 0 once that command exits 0. It is a
command, not a log pattern: a bare word no shell can run (`--until EXIT` with a log) is
read as `--marker EXIT` (with a note), and without a log it is refused, since two runs
waited 540 s each on logs already ending EXIT 0. Given a log too, it waits for the condition, then for the log's marker or for no process to
have the log open any more (whichever comes first), and prints the log's tail; a log path that still does not exist 10 s after the condition holds ends the wait (exit 0, with a note).

A job with a known pid: `--pid 12345` returns once that process has exited. Do not
use `--until "pgrep -f name"`: the shell running it matches its own command line, so it
returns at once (friction 2026-11-06); use `--pid`, or `--gone NAME`.

A job known only by name: `--gone survey.py` returns once no process's command line
contains `survey.py`, reading /proc itself and skipping wait_for and the shells that
started it. The bracket trick (`pgrep -f '[s]urvey.py'`) still matched itself whenever
the bare name appeared elsewhere on the same command line (a log called survey-out.log,
a second command in a chain): three reports on 2026-11-18, one a 30-minute wait that
never fired. It prints what it matched first, so a typo that matches nothing says so.

`echo EXIT $?` works as a marker line too: with no `--marker`, a `DONE` line or an
`EXIT 0` line both end the wait (friction 2026-11-11: runs guessed `--pattern` or
waited out the timeout on an EXIT log), and the printed tail shows the exit code.
Lower-case `exit 0` or `done` lines (alone, or with an exit code) end the default wait too.
`--marker X` waits for X alone. A marker followed by more output, in a log a
process still has open, is an earlier phase's (a second `>>` phase): the wait
goes on until a marker ends the log or the writer closes it. The default also accepts the line the harness
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
import argparse, os, re, subprocess, sys, time

# Terminal escapes (colour, cursor show/hide, OSC titles). Vitest, Playwright and pnpm
# end a run with `ESC[?25h` (show cursor) and no newline, so a following `echo EXIT $?`
# wrote `ESC[?25hEXIT 0` and no marker test matched: two runs waited out 580 s on logs
# that "already ended with EXIT 0" (run records 2026-11-26). Matching reads lines without them.
ANSI = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\)|[@-Z\\-_])")


def plain(line):
    return ANSI.sub("", line)


# A default marker glued to the end of the job's last line, `...100%EXIT 0`: the job's
# own output ended without a newline before the `echo`. Taken only from the log's last
# non-blank line and only once no process holds the log open, so a job that prints
# "...EXIT 0" mid-run is not cut short. A glued DONE needs a non-word character before
# it, so a custom marker such as PDKDONE still needs --marker or --until.
GLUED = re.compile(r"(?:(?<![A-Za-z0-9_])DONE|EXIT[ =:]-?\d+|\[exited with code -?\d+\])\s*$")


def glued_marker(lines, held):
    last = next((l for l in reversed(lines) if l.strip()), "")
    return bool(GLUED.search(last)) and held() == []


def is_marker(line, marker):
    """The marker alone, or as the line's first word: `--marker EXIT` matches
    `EXIT 0` (an `echo EXIT $?` line), `DONE` matches `DONE in 42 s`. A marker
    inside a line (`not DONE yet`) does not count (friction 2026-11-11: `--marker
    EXIT` waited its full 540 s timeout on a log that ended `EXIT 0`). A marker
    that ends in `=` or `:` is a prefix: `rc=` matches `rc=0` (an `echo rc=$?`
    line; friction 2026-11-13, the same 540 s wait). A bare word followed by `=`
    counts too: `--marker BUILD_EXIT` matches `BUILD_EXIT=0` (friction 2026-11-16,
    a full timeout on a log whose last line was exactly that)."""
    s = line.strip()
    # A marker given with trailing space (`--marker 'exit '`) meant "exit, then
    # anything", but no stripped line ends in a space, so it never matched: a full
    # 540 s wait on a log ending `exit 0` (friction 2026-11-19). Strip it here.
    marker = marker.strip() or marker
    if marker[-1] in "=:" and s.startswith(marker):
        return True
    return s == marker or (s.startswith(marker) and s[len(marker)] in " \t:-=")


DEFAULT_MARKERS = ("DONE", "EXIT", "[exited with code")


def is_quiet_marker(line):
    """A lower- or title-case `done` / `exit` line that only an `echo` writes: the
    word alone, or followed by an exit code (`exit 0`, `Done 3`). Runs end jobs
    with `echo exit $?` or `echo done` and the upper-case default waited the full
    timeout on them (six reports, 2026-11-12..19). Words with more after them
    (`done loading`, `Exit code was ...`) stay out: a job prints those mid-run."""
    parts = line.strip().split()
    if not parts or parts[0].lower() not in ("done", "exit") or len(parts) > 2:
        return False
    return len(parts) == 1 or parts[1].lstrip("-").isdigit()


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


def stale_marker(lines, markers, held, quiet=False):
    """True when every marker line is an earlier phase's: output follows the last
    one and a process still has the log open, so the job is still writing.

    A second phase appended to the same log (`>> out.log`) left phase one's DONE
    in place, and two 10-minute waits on phase two returned at once (friction
    2026-11-15). A finished job holds no descriptor, and a marker that is the
    last line still ends the wait, so a wait called after the job is unchanged.
    """
    idx = [i for i, l in enumerate(lines) if any(is_marker(l, m) for m in markers) or (quiet and is_quiet_marker(l))]
    if not idx or not any(l.strip() for l in lines[idx[-1] + 1:]):
        return False
    return bool(held())


def wait(path, marker=DEFAULT_MARKERS, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep,
         boot=None, grace=20.0, held=None, closed_ends=False):
    """(True, lines) once a marker line appears; (False, []) on timeout; (None, lines)
    when the log was last written before `boot` (the machine's boot time) and stays
    so for `grace` seconds: the job died in a restart. The grace covers a job
    started after the boot that appends (`>>`) and has not written yet.
    `held()` says whether a process still has the log open (default: /proc);
    a marker with output after it in a held log is stale (`stale_marker`).
    With `closed_ends` (an `--until` condition already holds), a log no process
    has open also ends the wait, marker or not: the writer is done."""
    if held is None:
        held = lambda: holders(path)
    start = clock()
    end = start + timeout
    while True:
        # Read the deadline before the log, so the last read comes after it: a marker
        # written between the final read and the deadline check timed out a finished job
        # (friction 2026-11-26).
        last = clock() >= end
        if os.path.exists(path):
            with open(path, errors="replace") as f:
                lines = [plain(l) for l in f.read().splitlines()]
            markers = (marker,) if isinstance(marker, str) else marker
            quiet = markers == DEFAULT_MARKERS
            if (any(is_marker(l, m) for l in lines for m in markers) or (quiet and any(map(is_quiet_marker, lines)))) \
                    and not stale_marker(lines, markers, held, quiet):
                return True, lines
            if quiet and glued_marker(lines, held):
                return True, lines
            if closed_ends and held() == []:
                return True, lines
            if boot is not None and os.stat(path).st_mtime < boot and clock() - start >= min(grace, timeout):
                return None, lines
        if last:
            return False, []
        nap(interval)


def not_a_command(cmd, run=subprocess.call):
    """True when `cmd` is one bare word the shell cannot run (`EXIT`, `DONE`): a marker
    passed to --until by mistake. Two runs on 2026-11-26 wrote `--until EXIT` for a log
    ending `EXIT 0` and waited out 540 s, since the shell answers 127 forever. Checked with
    `command -v`, so nothing is run."""
    word = cmd.strip()
    if not word or any(c.isspace() or c in "|&;<>()$`'\"\\*?[]{}=!~/" for c in word):
        return False
    return run(["sh", "-c", 'command -v "$1"', "sh", word],
               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) != 0


def wait_until(cmd, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep, run=subprocess.call):
    end = clock() + timeout
    while True:
        if run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 0:
            return True
        if clock() >= end:
            return False
        nap(interval)


def until_missing(cmd, run=subprocess.call):
    """True when `cmd` (a longer command not_a_command let through) exits 127: the shell
    cannot find its program, so the wait warns instead of failing silently forever."""
    return run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) == 127


LOG_GRACE = 10.0


def log_appears(path, grace=LOG_GRACE, interval=1.0, clock=time.monotonic, nap=time.sleep):
    """True once `path` exists, False if it still does not after `grace` seconds."""
    end = clock() + grace
    while not os.path.exists(path):
        if clock() >= end:
            return False
        nap(interval)
    return True


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


def ancestors(pid=None, proc="/proc"):
    """`pid` (default: this process) and every parent above it, read from /proc."""
    pid = os.getpid() if pid is None else pid
    seen = set()
    while pid > 0 and pid not in seen:
        seen.add(pid)
        try:
            with open(os.path.join(proc, str(pid), "stat")) as f:
                pid = int(f.read().rsplit(")", 1)[1].split()[1])
        except (OSError, IndexError, ValueError):
            break
    return seen


def matching(name, proc="/proc", skip=None):
    """[(pid, command)] of live processes whose command line contains `name`,
    leaving out `skip` (default: this process and its ancestors, whose own
    command lines name it: the self-match `pgrep -f` falls into). None when
    /proc can't be listed."""
    skip = ancestors(proc=proc) if skip is None else skip
    try:
        pids = [int(d) for d in os.listdir(proc) if d.isdigit()]
    except OSError:
        return None
    found = []
    for pid in pids:
        if pid in skip:
            continue
        try:
            with open(os.path.join(proc, str(pid), "cmdline"), "rb") as f:
                cmd = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        except OSError:
            continue
        if cmd and name in cmd and pid_alive(pid):
            found.append((pid, cmd))
    return found


def wait_gone(name, timeout=100.0, interval=2.0, clock=time.monotonic, nap=time.sleep, find=matching):
    """True once nothing matches `name`; False at the timeout."""
    end = clock() + timeout
    while find(name):
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


def short_cmd(cmd, width=80):
    """The holder's command line, cut in the middle so its arguments survive.

    A head-only cut at 60 characters showed 'run.py --draws 10' for
    '--draws 1000', which read as the wrong job running (friction 2026-11-17).
    The interpreter path at the front is what a reader can spare."""
    if len(cmd) <= width:
        return cmd
    head = width // 3
    return cmd[:head] + "..." + cmd[-(width - head - 3):]


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
        hint = (f"pid {pid} ({short_cmd(cmd)!r}) still has it open, so the job is running"
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
    """How to wait longer. The 100 s default keeps a plain call under the
    tool's 120 s limit, but the tool takes up to 600 s, and three runs in
    three days waited out 100 s on a ~15 minute job without knowing --timeout
    existed (friction 2026-11-12). Past 540 s the hint said nothing, so runs
    re-called a 540 s wait four to six times on a 20 to 50 minute job (seven
    run records, 2026-11-18/19) although one background wait covers it."""
    bg = ("for a job of many minutes, run this same wait with run_in_background and a --timeout "
          "past the job's length (the tool's background timeout takes up to 7200000 ms): the "
          "harness wakes you when it exits, one call instead of several")
    if timeout >= 540:
        return "; " + bg
    return "; to wait up to 9 min in one call, pass --timeout 540 and set the tool call's timeout to 600000 ms; " + bg


# Every timeout line starts with this, so a chained `wait_for ...; grep` or `; tail`, whose
# own exit 0 the harness reports, still reads as not done: two runs took a background
# --until wait's "still failing" line for completion (2026-11-18/19 records).
TIMED_OUT = "wait_for: TIMED OUT (exit 1):"


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("log", nargs="?")
    ap.add_argument("--until", help="shell command; wait until it exits 0 (no log needed)")
    ap.add_argument("--pid", type=int, help="wait until this process id has exited")
    ap.add_argument("--gone", metavar="NAME",
                    help="wait until no other process's command line contains NAME (no pgrep self-match)")
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
    if a.gone is not None and not a.gone.strip():
        ap.error("--gone must not be empty")
    if a.gone:
        now = matching(a.gone)
        if now is None:
            print("wait_for: /proc cannot be listed here; use --pid or a log marker", file=sys.stderr)
            return 1
        if not now:
            print(f"wait_for: no process matches {a.gone!r} (already exited, or the name is wrong)")
            return 0
        print(f"wait_for: waiting on {len(now)} process(es) matching {a.gone!r}: "
              + "; ".join(f"{pid} {short_cmd(cmd, 60)!r}" for pid, cmd in sorted(now)[:3]), file=sys.stderr)
        if wait_gone(a.gone, a.timeout):
            print(f"wait_for: no process matches {a.gone!r} any more")
            return 0
        left = matching(a.gone) or []
        print(f"{TIMED_OUT} {len(left)} process(es) matching {a.gone!r} still running after {a.timeout:.0f}s"
              f"{': ' + str(sorted(left)[0][0]) if left else ''}; call again{longer(a.timeout)}", file=sys.stderr)
        return 1
    if a.pid:
        if wait_pid(a.pid, a.timeout):
            print(f"wait_for: pid {a.pid} has exited")
            return 0
        print(f"{TIMED_OUT} pid {a.pid} still running after {a.timeout:.0f}s; call again{longer(a.timeout)}", file=sys.stderr)
        return 1
    if a.until and not_a_command(a.until):
        if not a.log or a.marker is not None:
            ap.error(f"--until {a.until!r} is not a command the shell can run, so it would never succeed; "
                     f"to wait for a {a.until!r} line in a log, pass the log and --marker {a.until}")
        print(f"wait_for: {a.until!r} is not a command, so it is read as the log's marker "
              f"(--marker {a.until}); --until takes a shell command", file=sys.stderr)
        a.marker, a.until = a.until, None
    timeout = a.timeout
    # Two runs fixed `--until EXIT` the same day (2026-11-26) with two checks; not_a_command
    # above catches the bare word, so only the longer missing command is left to warn about.
    if a.until and until_missing(a.until):
        print(f"wait_for: warning: --until {a.until!r} is not a command the shell can find (exit 127); "
              "it is a shell command that must exit 0, not a log pattern (use a log with --marker); "
              "waiting anyway in case it gets installed", file=sys.stderr)
    if a.until:
        started = time.monotonic()
        if not wait_until(a.until, a.timeout):
            print(f"{TIMED_OUT} '{a.until}' still failing after {a.timeout:.0f}s; call again{longer(a.timeout)}", file=sys.stderr)
            return 1
        if not a.log:
            print("wait_for: condition met")
            return 0
        # A log given with --until was ignored, so a wait returned "condition met" with no
        # output before the job had written its last line (friction 2026-11-16). Both
        # given means both: the condition, then the log's marker, in what time is left.
        timeout = max(0.0, a.timeout - (time.monotonic() - started))
        # A log path that never appears (a typo, a job that writes elsewhere) then waited the
        # whole timeout for a marker after the condition had already said done: one 9-minute
        # wait on 2026-11-18. The condition is the signal; give the log a short grace to appear.
        if not log_appears(a.log, min(LOG_GRACE, timeout)):
            print(f"wait_for: condition met; {a.log} does not exist (wrong path, or the job writes "
                  "elsewhere?), so there is no output to show")
            return 0
        print("wait_for: condition met; now waiting for the log's marker, or for its writer to close it",
              file=sys.stderr)
    if not a.log:
        ap.error("give a log file, --until, --pid or --gone")
    boot = None if a.ignore_restart else boot_time()
    # Once the condition holds, a log nobody still writes is finished too: waiting
    # for a marker it will never get timed out on a done job twice (a task output
    # file with no DONE, a log ending in a custom PDKDONE; friction 2026-11-21).
    # A log the job still holds open waits for its marker, as before (2026-11-16).
    ok, lines = wait(a.log, a.marker or DEFAULT_MARKERS, timeout, boot=boot,
                     held=lambda: holders(a.log), closed_ends=bool(a.until))
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
        print(f"{TIMED_OUT} no '{shown}' line in {a.log} after {a.timeout:.0f}s; {progress(a.log)}{longer(a.timeout)}", file=sys.stderr)
        return 1
    print("\n".join(lines[-15:]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
