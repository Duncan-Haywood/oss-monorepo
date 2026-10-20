"""Extract five-message English threads (prompter, assistant, prompter, assistant, prompter) from OpenAssistant oasst1.

oasst1 is Apache-2.0 (Koepf et al., 2023). Usage: python3 build_threads.py trees.jsonl.gz [n_threads]
Writes data/threads.jsonl.gz: one row per thread with the five texts and nothing that identifies a writer.
"""
import gzip, json, random, sys

ROLES = ["prompter", "assistant", "prompter", "assistant", "prompter"]
MAXC = 500   # characters kept per message; the imitator is capped to match


def walk(node, path, out):
    path = path + [node]
    if len(path) == 5:
        out.append(path)
        return
    for r in node.get("replies", []):
        walk(r, path, out)


def ok(m):
    return (m["lang"] == "en" and not m.get("deleted") and not m.get("synthetic")
            and m.get("review_result") is not False and 20 <= len(m["text"]) <= 2000)


def build(path, n=400, seed=0):
    rows = []
    for line in gzip.open(path, "rt"):
        tree = json.loads(line)
        paths = []
        walk(tree["prompt"], [], paths)
        paths = [p for p in paths if all(ok(m) for m in p) and [m["role"] for m in p] == ROLES]
        if paths:
            rng = random.Random(tree["message_tree_id"])
            p = rng.choice(paths)
            rows.append({"tree": tree["message_tree_id"][:8], "turns": [m["text"][:MAXC] for m in p]})
    random.Random(seed).shuffle(rows)
    return rows[:n]


if __name__ == "__main__":
    rows = build(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 400)
    with gzip.open("data/threads.jsonl.gz", "wt") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    print(len(rows), "threads")
