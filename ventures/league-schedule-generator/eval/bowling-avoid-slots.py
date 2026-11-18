"""Try a lane-limit shape on other circle-method slots until one has a SAT answer.

    /usr/bin/python3 eval/bowling-avoid-slots.py <teams> <weeks> '<shape on 0..k-1>' [timeout_s] [max_tries]

A shape stored on slots 0, 1, ... (eval/bowling-avoid-shapes.py) can be UNSAT, or too slow, for
that one dealing while another dealing of the limited teams has an answer: which slots meet which in
the first W rounds, and how often each meets the fixed slot n-1, depends on the slots. Balance does
not see names, so any slots will do (bowling.mjs deals the limited teams the slots the key names).

Tries slot tuples in a fixed order (first team kept on slot 0, the others moved; then every tuple
that includes the fixed slot n-1; then the rest), 4 at a time, each one a separate
`timeout <s> python3 eval/bowling-avoid-shapes.py` with SYMBREAK=1. Stops at the first SAT and
prints its JSON on stdout ({"n,W|shape on those slots": code}); every try's verdict goes to stderr.
"""
import itertools, json, os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

here = Path(__file__).resolve().parent
n, W, shape = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
timeout = int(sys.argv[4]) if len(sys.argv) > 4 else 120
max_tries = int(sys.argv[5]) if len(sys.argv) > 5 else 400
parts = [p.split(":") for p in shape.split(";")]
k = len(parts)


def candidates():
    seen = {tuple(range(k))}
    orders = []
    if k > 1:
        orders.append(t for t in itertools.permutations(range(1, n), k - 1))
        orders.append(t for t in itertools.permutations(range(n), k) if n - 1 in t)
    else:
        orders.append(((s,) for s in range(1, n)))
    orders.append(itertools.permutations(range(n), k))
    for gen in orders:
        for t in gen:
            t = (0,) + t if len(t) == k - 1 else t
            if len(set(t)) != k or t in seen:
                continue
            seen.add(t)
            yield t


def run(slots):
    s = ";".join(f"{slots[i]}:{parts[i][1]}" for i in range(k))
    env = dict(os.environ, SYMBREAK="1")
    try:
        r = subprocess.run(["timeout", str(timeout), sys.executable, str(here / "bowling-avoid-shapes.py"), str(n), str(W), s],
                           capture_output=True, text=True, env=env)
    except Exception as e:  # noqa: BLE001
        return s, None, str(e)
    line = (r.stderr.strip().splitlines() or [f"{s}: TIMEOUT after {timeout} s"])[-1]
    if r.returncode == 124:
        line = f"{n} teams x {W} weeks, shape {s}: TIMEOUT after {timeout} s"
    out = json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else {}
    return s, out, line


tries = list(itertools.islice(candidates(), max_tries))
found = None
with ThreadPoolExecutor(4) as pool:
    futs = []
    it = iter(tries)
    for _ in range(4):
        t = next(it, None)
        if t is not None:
            futs.append(pool.submit(run, t))
    while futs and not found:
        done = next(as_completed(futs))
        futs.remove(done)
        s, out, line = done.result()
        print(line, file=sys.stderr, flush=True)
        if out:
            found = out
            break
        t = next(it, None)
        if t is not None:
            futs.append(pool.submit(run, t))
    # tries still running finish within their own timeout; their answers are not needed
print(json.dumps(found or {}))
