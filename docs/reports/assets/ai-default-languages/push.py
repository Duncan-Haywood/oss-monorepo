"""Pushed-language condition: the same tasks with a language named.

Usage: python3 push.py  -> appends to pushed.jsonl (resumable)
Agent framing (Claude Code system prompt, file tools only), sonnet, 3 reps.
The default-language replies for the same tasks come from raw.jsonl.
"""
import json, os, tempfile
from concurrent.futures import ThreadPoolExecutor
from run import call

HERE = os.path.dirname(os.path.abspath(__file__))
TASKS = {t["id"]: t["prompt"] for t in json.load(open(os.path.join(HERE, "tasks.json")))}
PUSHES = [("primes", "Rust"), ("primes", "C"), ("primes", "Python"), ("csvmonthly", "Rust"), ("csvmonthly", "Go"),
          ("wordfreq", "Rust"), ("wordfreq", "Go")]
OUT = os.path.join(HERE, "pushed.jsonl")

def main():
    done = set()
    if os.path.exists(OUT):
        done = {(r["task"], r["lang"], r["rep"]) for r in map(json.loads, open(OUT))}
    jobs = [(t, l, r) for t, l in PUSHES for r in range(3) if (t, l, r) not in done]
    def work(job):
        t, l, r = job
        cwd = tempfile.mkdtemp(prefix="lang-push-")
        reply, usage = call("sonnet", "agent", f"{TASKS[t]} Use {l}.", cwd)
        files = {}
        for dp, _, fs in os.walk(cwd):
            for fn in fs:
                p = os.path.join(dp, fn)
                files[os.path.relpath(p, cwd)] = open(p, errors="replace").read()[:20000]
        with open(OUT, "a") as fh:
            fh.write(json.dumps({"task": t, "lang": l, "rep": r, "served_ok": bool(usage),
                                 "reply": reply, "files": files}) + "\n")
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(work, jobs))

if __name__ == "__main__":
    main()
