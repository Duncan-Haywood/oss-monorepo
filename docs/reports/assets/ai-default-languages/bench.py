"""Compile and run model-written programs; record build success, correctness, time.

Usage: python3 bench.py > bench.txt
Reads primes, wordfreq and csvmonthly replies from raw.jsonl (default
language, sonnet, agent framing) and pushed.jsonl (language named).
Inputs are generated deterministically here. Each program gets its input
path as argv[1], on stdin, and under common file names in its working
directory. Needs python3+pandas, gcc, rustc/cargo, go, node on PATH.
"""
import collections, json, os, random, re, shutil, subprocess, tempfile, time
from classify import ALIAS, blocks, label

HERE = os.path.dirname(os.path.abspath(__file__))
TASKS = {t["id"]: t for t in json.load(open(os.path.join(HERE, "tasks.json")))}
WORK = tempfile.mkdtemp(prefix="lang-bench-")
TIMEOUT = 300

def make_inputs():
    rnd = random.Random(20261020)
    words = sorted({"".join(rnd.choices("abcdefghijklmnopqrstuvwxyz", k=rnd.randint(2, 9)))
                    for _ in range(20000)})
    rnd.shuffle(words)
    weights = [1 / (i + 1) for i in range(len(words))]          # Zipf-like
    text = os.path.join(WORK, "input.txt")
    with open(text, "w") as fh:
        for _ in range(400):                                       # ~400 x 50k words
            fh.write(" ".join(rnd.choices(words, weights, k=50000)) + "\n")
    csv = os.path.join(WORK, "sales.csv")
    totals = collections.defaultdict(float)
    with open(csv, "w") as fh:
        fh.write("date,region,amount\n")
        for _ in range(200000):
            d = f"2025-{rnd.randint(1, 12):02d}-{rnd.randint(1, 28):02d}"
            reg = rnd.choice(["North", "South", "East", "West"])
            amt = round(rnd.uniform(1, 500), 2)
            totals[(d[:7], reg)] += amt
            fh.write(f"{d},{reg},{amt}\n")
    return {"wordfreq": text, "csvmonthly": csv}, totals

def main_block(reply):
    bs = [(t, b) for t, b in blocks(reply) if t not in ("", "text", "console", "output", "bash", "sh", "toml")]
    return max(bs, key=lambda tb: len(tb[1])) if bs else (None, None)

def build(lang, src, reply, d):
    """Return (argv, error)."""
    lang = ALIAS.get(lang, lang)
    if lang == "Python":
        open(f"{d}/main.py", "w").write(src)
        return ["python3", "main.py"], None
    if lang == "JavaScript":
        open(f"{d}/main.mjs", "w").write(src)
        return ["node", "main.mjs"], None
    if lang in ("C", "C++"):
        ext, cc = ("c", "gcc") if lang == "C" else ("cpp", "g++")
        open(f"{d}/main.{ext}", "w").write(src)
        r = subprocess.run([cc, "-O2", "-march=native", f"main.{ext}", "-o", "main", "-lm", "-lpthread", "-fopenmp"],
                           cwd=d, capture_output=True, text=True)
        return (["./main"], None) if r.returncode == 0 else (None, r.stderr[-300:])
    if lang == "Go":
        open(f"{d}/main.go", "w").write(src)
        r = subprocess.run(["go", "build", "-o", "main", "main.go"], cwd=d, capture_output=True, text=True,
                           env={**os.environ, "GO111MODULE": "off"})
        return (["./main"], None) if r.returncode == 0 else (None, r.stderr[-300:])
    if lang == "Rust":
        toml = [b for t, b in blocks(reply) if t == "toml" and "[dependencies]" in b]
        if toml:
            os.makedirs(f"{d}/src")
            t = toml[0]
            if "[package]" not in t:
                t = '[package]\nname = "m"\nversion = "0.1.0"\nedition = "2021"\n' + t
            open(f"{d}/Cargo.toml", "w").write(t)
            open(f"{d}/src/main.rs", "w").write(src)
            r = subprocess.run(["cargo", "build", "--release", "-q"], cwd=d, capture_output=True, text=True)
            if r.returncode:
                return None, r.stderr[-300:]
            bins = [f for f in os.listdir(f"{d}/target/release") if os.access(f"{d}/target/release/{f}", os.X_OK)
                    and os.path.isfile(f"{d}/target/release/{f}")]
            return [f"{d}/target/release/{bins[0]}"], None
        open(f"{d}/main.rs", "w").write(src)
        r = subprocess.run(["rustc", "-O", "-C", "target-cpu=native", "main.rs", "-o", "main"], cwd=d,
                           capture_output=True, text=True)
        return (["./main"], None) if r.returncode == 0 else (None, r.stderr[-300:])
    return None, f"no runner for {lang}"

def check(task, out, totals):
    if task == "primes":
        return "50847534" in out.replace(",", "").replace("_", "")
    if task == "wordfreq":
        return len(re.findall(r"\d+", out)) >= 10
    if task == "csvmonthly":
        want = [f"{v:.2f}" for k, v in sorted(totals.items())[:6]]
        flat = out.replace(",", "")
        return sum(w in flat or w.rstrip("0").rstrip(".") in flat for w in want) >= 4
    return None

def run(task, lang, reply, inputs, totals):
    tag, src = main_block(reply)
    if not src:
        return {"ok": False, "err": "no code"}
    d = tempfile.mkdtemp(dir=WORK)
    if task in inputs:
        for name in ("input.txt", "sales.csv", "data.csv", "sales_data.csv", "text.txt", "file.txt"):
            os.symlink(inputs[task], f"{d}/{name}")
    argv, err = build(tag, src, reply, d)
    lines = len(src.splitlines())
    if err:
        return {"ok": False, "err": "build: " + err.strip().splitlines()[-1][:120], "lines": lines, "lang": ALIAS.get(tag, tag)}
    if task in inputs:
        argv = argv + [inputs[task]]
    t0 = time.time()
    try:
        stdin = open(inputs[task]) if task in inputs else subprocess.DEVNULL
        r = subprocess.run(argv, cwd=d, stdin=stdin, capture_output=True, text=True, timeout=TIMEOUT)
        out, rc = r.stdout + r.stderr, r.returncode
    except subprocess.TimeoutExpired:
        return {"ok": False, "err": f"timeout {TIMEOUT}s", "lines": lines, "lang": ALIAS.get(tag, tag)}
    dt = time.time() - t0
    ok = rc == 0 and check(task, out, totals)
    return {"ok": ok, "secs": round(dt, 2), "lines": lines, "lang": ALIAS.get(tag, tag),
            "err": None if ok else f"rc={rc} out={out.strip()[-100:]!r}"}

def main():
    inputs, totals = make_inputs()
    jobs = []
    for r in map(json.loads, open(os.path.join(HERE, "raw.jsonl"))):
        if r["task"] in ("primes", "wordfreq", "csvmonthly") and r["model"] == "sonnet" and r["framing"] == "agent":
            jobs.append((r["task"], "default", r["reply"]))
    if os.path.exists(os.path.join(HERE, "pushed.jsonl")):
        for r in map(json.loads, open(os.path.join(HERE, "pushed.jsonl"))):
            jobs.append((r["task"], "pushed " + r["lang"], r["reply"]))
    print(f"cores={os.cpu_count()}  inputs: wordfreq 20M words, csvmonthly 200k rows, primes below 1e9")
    for task, cond, reply in sorted(jobs, key=lambda j: (j[0], j[1])):
        res = run(task, cond, reply, inputs, totals)
        print(f"{task:10} {cond:13} lang={res.get('lang', '?'):10} lines={res.get('lines', 0):4} "
              f"ok={res['ok']!s:5} secs={res.get('secs', '-')!s:7} {res['err'] or ''}", flush=True)
    shutil.rmtree(WORK, ignore_errors=True)

if __name__ == "__main__":
    main()
