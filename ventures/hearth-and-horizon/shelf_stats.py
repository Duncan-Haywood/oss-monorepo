"""Compare the Hearth & Horizon and For Other Minds shelves with a few plain counts.

    python3 shelf_stats.py            # per-story table, then shelf medians
    python3 shelf_stats.py --json     # the same numbers as JSON

Little Lamps is left out: it is a children's shelf, not science fiction.
The counts are crude on purpose (whitespace words, regex sentences, double
quotes as dialogue) so anyone can check them by hand. They back the post
docs/posts/2026-10-24-stories-for-people-and-stories-for-agents.md.
"""
import json
import re
import statistics
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
SHELVES = ("hearth-and-horizon", "for-other-minds")
FAITH_END = ("bell", "angelus", "lauds", "terce", "mass")


def split(text):
    m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
    meta = dict(re.findall(r"^(\w+): *(.*)$", m.group(1), re.M))
    body = m.group(2)
    body = re.sub(r"^\*A note before the story\..*?\*$", "", body, flags=re.M)
    has_notes = "*Notes for the curious.*" in body
    body = body.split("*Notes for the curious.*")[0]
    return meta, body, has_notes


def stats(path, audio):
    meta, body, has_notes = split(path.read_text())
    words = body.split()
    n = len(words)
    lower = Counter(re.findall(r"[a-z']+", body.lower()))
    flat = re.sub(r"\s+", " ", body)
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", flat) if len(s.split()) > 1]
    quoted = re.findall(r"[\"“](.+?)[\"”]", body, re.S)
    paras = [p for p in body.split("\n") if p.strip() and p.strip() != "* * *"]
    tail = " ".join(paras[-4:]).lower()
    return {
        "slug": path.stem,
        "shelf": meta["shelf"],
        "words": n,
        "sentence_words": round(statistics.mean(len(s.split()) for s in sentences), 1),
        "dialogue_pct": round(100 * sum(len(q.split()) for q in quoted) / n, 1),
        "digits_per_1000": round(1000 * sum(bool(re.search(r"\d", w)) for w in words) / n, 1),
        "i_me_my_per_1000": round(1000 * (lower["i"] + lower["me"] + lower["my"]) / n, 1),
        "present_to_past": round((lower["is"] + lower["am"] + lower["are"]) / max(1, lower["was"] + lower["were"]), 2),
        "faith_in_last_4_paras": any(w in tail for w in FAITH_END),
        "notes_for_the_curious": has_notes,
        "audio": path.stem in audio,
    }


def main():
    audio = json.loads((HERE / "audio" / "manifest.json").read_text())
    rows = []
    for p in sorted((HERE / "stories").glob("*.md")):
        if re.search(r"^shelf: *(\S+)", p.read_text(), re.M).group(1) in SHELVES:
            rows.append(stats(p, audio))
    summary = {}
    for shelf in SHELVES:
        r = [x for x in rows if x["shelf"] == shelf]
        summary[shelf] = {"stories": len(r)}
        for k in ("words", "sentence_words", "dialogue_pct", "digits_per_1000", "i_me_my_per_1000", "present_to_past"):
            summary[shelf]["median_" + k] = round(statistics.median(x[k] for x in r), 2)
        for k in ("faith_in_last_4_paras", "notes_for_the_curious", "audio"):
            summary[shelf][k] = sum(x[k] for x in r)
    if "--json" in sys.argv:
        print(json.dumps({"stories": rows, "shelves": summary}, indent=1))
        return
    cols = list(rows[0])[2:]
    print("shelf slug " + " ".join(cols))
    for x in rows:
        print(x["shelf"][:5], x["slug"], " ".join(str(x[c]) for c in cols))
    print()
    for shelf, s in summary.items():
        print(shelf, " ".join(f"{k}={v}" for k, v in s.items()))


if __name__ == "__main__":
    main()
