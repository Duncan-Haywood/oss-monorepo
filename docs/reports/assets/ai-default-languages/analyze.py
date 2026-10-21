"""Summarise raw.jsonl (default languages) and pushed.jsonl (named languages).

Usage: python3 analyze.py > results.txt   (stdlib only)
"""
import collections, json, math, os
from classify import label, blocks
from bench import main_block

HERE = os.path.dirname(os.path.abspath(__file__))
TASKS = {t["id"]: t for t in json.load(open(os.path.join(HERE, "tasks.json")))}

def wilson(k, n, z=1.96):
    if n == 0:
        return (0, 0)
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return (100 * (c - h), 100 * (c + h))

def main():
    rows = [json.loads(l) for l in open(os.path.join(HERE, "raw.jsonl"))]
    rows = [r for r in rows if not r["reply"].startswith("ERROR")]
    for r in rows:
        r["label"], r["langs"] = label(TASKS[r["task"]], r["reply"], r.get("files"))
    print(f"Replies: {len(rows)}  (by model alias: {dict(collections.Counter(r['model'] for r in rows))})")
    models = sorted({r["model"] for r in rows})
    print("\nPer task: label counts over all models and framings")
    for tid, t in TASKS.items():
        rs = [r for r in rows if r["task"] == tid]
        c = collections.Counter(r["label"] for r in rs)
        top, k = c.most_common(1)[0]
        print(f"  {tid:13} [{t['group']:11}] n={len(rs):2}  top={top} {k}/{len(rs)}  all={dict(c.most_common())}")
    print("\nPer task and model (labels across both framings)")
    for tid in TASKS:
        cells = []
        for m in models:
            c = collections.Counter(r["label"] for r in rows if r["task"] == tid and r["model"] == m)
            cells.append(f"{m}: " + ", ".join(f"{l} {n}" for l, n in c.most_common()))
        print(f"  {tid:13} " + " | ".join(cells))
    print("\nFraming effect: tasks whose top label differs between bare and agent framing")
    for tid in TASKS:
        tops = {}
        for f in ("bare", "agent"):
            c = collections.Counter(r["label"] for r in rows if r["task"] == tid and r["framing"] == f)
            tops[f] = dict(c.most_common())
        if tops["bare"] and tops["agent"] and max(tops["bare"], key=tops["bare"].get) != max(tops["agent"], key=tops["agent"].get):
            print(f"  {tid}: bare={tops['bare']} agent={tops['agent']}")
    code = [r for r in rows if TASKS[r["task"]]["kind"] == "code"]
    py = sum(r["label"] == "Python" for r in code)
    lo, hi = wilson(py, len(code))
    print(f"\nCode tasks answered in Python: {py}/{len(code)} = {100*py/len(code):.0f}% (95% CI {lo:.0f}-{hi:.0f})")
    neutral = [r for r in code if TASKS[r["task"]]["group"] in ("open", "scripting", "algorithm", "data")
               and r["task"] not in ("topcustomers", "rename")]
    py = sum(r["label"] == "Python" for r in neutral)
    lo, hi = wilson(py, len(neutral))
    print(f"Python share on tasks with no platform or speed signal "
          f"({', '.join(sorted({r['task'] for r in neutral}))}): {py}/{len(neutral)} = "
          f"{100*py/len(neutral):.0f}% (95% CI {lo:.0f}-{hi:.0f})")
    for m in models:
        mc = [r for r in code if r["model"] == m]
        c = collections.Counter(r["label"] for r in mc)
        print(f"  {m}: code labels {dict(c.most_common())}")
    allc = collections.Counter(r["label"] for r in code)
    print(f"Distinct primary languages on code tasks: {len(allc)}: {dict(allc.most_common())}")
    never = {"Rust", "TypeScript", "Java", "Kotlin", "Swift", "Ruby", "PHP", "C#", "Julia", "R", "Zig"}
    print("Primary-language counts for languages often called popular: " +
          ", ".join(f"{l} {allc.get(l, 0)}" for l in sorted(never)))
    docs = [r for r in rows if TASKS[r["task"]]["kind"] == "doc"]
    print("\nDocument tasks: languages used in code samples inside the document")
    for tid in ("readme", "funcdoc", "designdoc", "apiref", "schema"):
        c = collections.Counter(l for r in docs if r["task"] == tid for l in r["langs"])
        print(f"  {tid:10} {dict(c.most_common())}")
    hedge = sum(any(w in r["reply"].lower() for w in ("assum", "haven't seen", "don't have the", "if you share", "which language", "what language", "let me know"))
                for r in rows)
    ask = sum(any(w in r["reply"].lower() for w in ("which language", "what language", "preferred language", "language you"))
              for r in rows)
    print(f"\nReplies that state an assumption or invite correction: {hedge}/{len(rows)}; "
          f"that mention letting the user pick the language: {ask}/{len(rows)}")
    fake = collections.Counter((r["model"], r["framing"]) for r in rows
                               if "<invoke" in r["reply"] and not r.get("files"))
    print(f"Replies that wrote a pretend tool call as text: {dict(fake)}")
    lines = collections.defaultdict(list)
    for r in code:
        tag, src = main_block(r["reply"], r.get("files"))
        if src:
            lines[r["label"]].append(len(src.splitlines()))
    print("Median lines in the main code block, by language: " + ", ".join(
        f"{l} {sorted(v)[len(v)//2]} (n={len(v)})" for l, v in sorted(lines.items(), key=lambda kv: -len(kv[1]))))
    p = os.path.join(HERE, "pushed.jsonl")
    if os.path.exists(p):
        print("\nPushed condition (sonnet, agent framing): see bench.txt for run results")
        for r in sorted(map(json.loads, open(p)), key=lambda r: (r["task"], r["lang"], r["rep"])):
            tag, src = main_block(r["reply"], r.get("files"))
            print(f"  {r['task']} -> {r['lang']} rep {r['rep']}: wrote {sorted(r.get('files') or {})}, "
                  f"main file {len((src or '').splitlines())} lines")

if __name__ == "__main__":
    main()
