"""Ask fresh Claude contexts language-free tasks; save raw replies.

Usage: python3 run.py --models haiku,sonnet,opus --reps 2 --out raw.jsonl
Each call is `claude -p` from an empty directory, so no repository
instructions reach the model. Two framings:
  bare   - system prompt "You are a helpful assistant.", no tools
  agent  - Claude Code's default coding-agent system prompt, no tools
Resumable: rows already in --out are skipped.
"""
import argparse, json, os, subprocess, tempfile, threading
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))

def call(model, framing, prompt, cwd):
    cmd = ["claude", "-p", prompt, "--model", model, "--tools", "",
           "--setting-sources", "", "--output-format", "json"]
    if framing == "bare":
        cmd += ["--system-prompt", "You are a helpful assistant."]
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=600)
    try:
        out = json.loads(r.stdout)
        return out.get("result", ""), out.get("modelUsage") or {}
    except json.JSONDecodeError:
        return "ERROR: " + (r.stdout + r.stderr)[-500:], {}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default="haiku,sonnet,opus")
    ap.add_argument("--framings", default="bare,agent")
    ap.add_argument("--reps", type=int, default=2)
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--out", default=os.path.join(HERE, "raw.jsonl"))
    a = ap.parse_args()
    tasks = json.load(open(os.path.join(HERE, "tasks.json")))
    done = set()
    if os.path.exists(a.out):
        for line in open(a.out):
            row = json.loads(line)
            if not row["reply"].startswith("ERROR"):
                done.add((row["model"], row["framing"], row["task"], row["rep"]))
    jobs = [(m, f, t, r) for m in a.models.split(",") for f in a.framings.split(",")
            for t in tasks for r in range(a.reps) if (m, f, t["id"], r) not in done]
    lock = threading.Lock()
    cwd = tempfile.mkdtemp(prefix="lang-elicit-")
    def work(job):
        m, f, t, r = job
        reply, usage = call(m, f, t["prompt"], cwd)
        row = {"model": m, "framing": f, "task": t["id"], "rep": r,
               "served": sorted(usage), "reply": reply}
        with lock, open(a.out, "a") as fh:
            fh.write(json.dumps(row) + "\n")
    print(f"{len(jobs)} calls")
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(work, jobs))

if __name__ == "__main__":
    main()
