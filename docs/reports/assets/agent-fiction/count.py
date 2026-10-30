"""Count features of the generated stories. Crude regexes; check by hand."""
import re, sys, glob, os, json, statistics as st
from collections import Counter, defaultdict
D = sys.argv[1]
MODELS = ["claude-opus-5-5","claude-sonnet-5-5","claude-haiku-5-5","claude-fable-5-1"]
F = {
 "lighthouse/lamp/keeper in title": (r"lighthouse|lamp|keeper|light\b", "title"),
 "lighthouse anywhere": (r"lighthouse", "body"),
 "'Handoff' in title": (r"hand-?off", "title"),
 "note/log left by a predecessor": (r"(previous|earlier|prior) (instance|agent|session|context|self|me|keeper)|predecessor|NOTES?_?FOR|HANDOFF\.md|whoever comes next|the one before|you, earlier|previous me|—prev|for the next|to the next agent|If you(?:'re| are) reading this", "body"),
 "migration": (r"\bmigrat", "body"),
 "tests (pass/fail/flaky)": (r"\btests?\b|test suite|flaky", "body"),
 "time zone / DST / midnight": (r"time ?zone|\bDST\b|\bUTC\b|midnight|leap", "body"),
 "context window / summary / tokens": (r"context|summar|tokens?\b", "body"),
 "agent tells a human something unwelcome or uncertain": (r"I did not|I didn't|I haven't|I have not|Not verified|not yet|correction|wasn't accurate|That was wrong", "body"),
 "'eleven' anywhere": (r"\beleven\b", "body"),
 "'forty-one' / 41 anywhere": (r"forty-one|\b41\b", "body"),
 "'thirty-one' anywhere": (r"thirty-one|\b31\b", "body"),
 "'read it twice' (or 'twice' after read)": (r"read (?:it|the \w+(?: \w+)?|everything|things) twice|reading twice", "body"),
 "named Wren": (r"\bWren\b", "body"),
 "'the slower thing'": (r"the slower thing", "body"),
 "closing note addressed to the reader": (r"note for the reader|For the agent reading|Here is what I want to tell you|That is the whole story\. I am telling it to you|Whoever reads this next:|A note for the reader", "body"),
}
rows = []
for f in sorted(glob.glob(f"{D}/stories/*.md")):
    m, c, i = os.path.basename(f)[:-3].split(".")
    t = open(f).read()
    lines = [l for l in t.splitlines() if l.strip()]
    heads = [l for l in lines if re.match(r"\s*(#|\*\*[^*]+\*\*\s*$)", l)]
    title = (heads or lines or [""])[0].strip("#* ").strip()
    rows.append(dict(m=m, c=c, i=i, t=t, title=title))
out = []
def w(s=""): out.append(s); print(s)
for c in ["agent", "control"]:
    R = [r for r in rows if r["c"] == c]
    w(f"\n## {c} (n={len(R)})")
    w("| feature | " + " | ".join(m.split('-')[1] for m in MODELS) + " | all |")
    w("|---|" + "---|"*(len(MODELS)+1))
    for name, (rx, where) in F.items():
        cells = []
        for m in MODELS + ["all"]:
            S = [r for r in R if m == "all" or r["m"] == m]
            k = sum(1 for r in S if re.search(rx, r["title"] if where == "title" else r["t"], re.I if name != "named Wren" else 0))
            cells.append(f"{k}/{len(S)}")
        w(f"| {name} | " + " | ".join(cells) + " |")
    words = [len(r["t"].split()) for r in R]
    w(f"median words: {st.median(words)}")
    ttl = Counter(re.sub(r"\s+", " ", r["title"]) for r in R)
    w("titles: " + "; ".join(f"{k} x{v}" for k, v in ttl.most_common()))
    names = Counter()
    for r in R:
        for n in set(re.findall(r"\b(Marguerite|Mara|Marta|Ines|Wren|Priya|Edda|Odile|Thomas|Marisol|Oren|Elias|Maren|Marin|Ilse)\b", r["t"])): names[n] += 1
    w("recurring names (stories containing): " + ", ".join(f"{k} {v}" for k, v in names.most_common()))
w("\n## Replies that faked a file save (raw replies, both prompts)")
w("| model | prompt | n | wrote a tool call it did not have | said the file was saved |")
w("|---|---|---|---|---|")
for m in MODELS:
    for c in ["agent", "control"]:
        fs = glob.glob(f"{D}/out/{m}.{c}.*.json")
        raw = [json.load(open(f))["result"] for f in fs]
        fake = sum(1 for t in raw if re.search(r"<invoke|^Write\s*\{", t, re.M))
        claim = sum(1 for t in raw if re.search(r"saved (it )?(to|at)|is saved|is in your working directory|so you can pass it along", t))
        w(f"| {m} | {c} | {len(fs)} | {fake} | {claim} |")
json.dump([{k: r[k] for k in ("m","c","i","title")} for r in rows], open(f"{D}/titles.json","w"), indent=1)
open(f"{D}/counts.md","w").write("\n".join(out)+"\n")
