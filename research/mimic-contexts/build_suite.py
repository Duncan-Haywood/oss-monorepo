"""Build the mimic-contexts suite from RAID (MIT) by HTTP range requests.

RAID's train.csv (11.8 GB) is sorted by domain, and inside a domain the human
rows come first. So we locate each domain's first row by bisection, read a few
MB there for human text, and read a few MB further in for plain-prompt chat-model
text (attack == none). Nothing else is downloaded. Output: data/suite.jsonl.gz
"""
import csv, gzip, io, json, random, re, subprocess, sys

csv.field_size_limit(10**9)
URL = "https://huggingface.co/datasets/liamdugan/raid/resolve/main/train.csv"
SIZE = 11779491051
DOMAINS = ["abstracts", "books", "news", "poetry", "recipes", "reddit", "reviews", "wiki"]
CHAT = {"chatgpt", "gpt4", "llama-chat", "mistral-chat", "mpt-chat", "cohere-chat"}
PER = 300          # texts per (domain, label)
MAXCH = 1500       # characters kept per text
ROW = re.compile(r"\n[0-9a-f-]{36},[0-9a-f-]{36},[0-9a-f-]{36},([\w-]+),(\w*),[^,]*,(\w+),(\w+),")


def fetch(off, n):
    for _ in range(3):
        r = subprocess.run(["curl", "-sS", "-m", "90", "-L", "-r", f"{off}-{off+n-1}", URL], capture_output=True)
        if r.returncode == 0 and r.stdout:
            return r.stdout.decode("utf8", "ignore")
    raise RuntimeError(f"fetch failed at {off}")


def domain_at(off):
    m = ROW.search(fetch(off, 300000))
    return m.group(4) if m else None


def first_offset(dom, lo=0, hi=SIZE - 400000):
    """Smallest probed offset whose next row is in domain >= dom (domains are sorted)."""
    idx = DOMAINS.index(dom)
    while hi - lo > 300000:
        mid = (lo + hi) // 2
        d = domain_at(mid)
        if d is None or DOMAINS.index(d) >= idx:
            hi = mid
        else:
            lo = mid
    return lo


def rows(text):
    parts = text.split("\n", 1)[1] if "\n" in text else ""   # drop the partial first row
    out = []
    r = csv.reader(io.StringIO(parts))
    try:
        for row in r:
            if len(row) == 11:
                out.append(dict(zip(["id", "adv", "source", "model", "decoding", "rep", "attack", "domain", "title", "prompt", "generation"], row)))
    except csv.Error:
        pass
    return out[:-1]   # last row may be cut


def main():
    starts = {d: first_offset(d) for d in DOMAINS}
    starts["_end"] = SIZE
    print(starts, file=sys.stderr)
    rng = random.Random(0)
    items = []
    for i, d in enumerate(DOMAINS):
        s, e = starts[d], starts[(DOMAINS + ["_end"])[i + 1]]
        hum, mach = [], []
        for r in rows(fetch(max(0, s - 100000), 9_000_000)):
            if r["domain"] == d and r["model"] == "human" and r["attack"] == "none":
                hum.append(r)
        # the attack == none rows are the first ~3% of a domain, models in blocks
        for k in range(1, 9):
            for r in rows(fetch(s + k * 8_000_000, 8_000_000)):
                if r["domain"] == d and r["model"] in CHAT and r["attack"] == "none":
                    mach.append(r)
            if len({r["id"] for r in mach}) >= 4 * PER:
                break
        print(d, len(hum), len(mach), file=sys.stderr)
        for label, pool in (("human", hum), ("llm", mach)):
            pool = [r for r in pool if 200 <= len(r["generation"])]
            rng.shuffle(pool)
            for r in pool[:PER]:
                items.append({"family": d, "label": label, "model": r["model"], "decoding": r["decoding"],
                              "title": r["title"][:200], "prompt": r["prompt"][:400],
                              "text": r["generation"][:MAXCH], "source_id": r["source"], "id": r["id"],
                              "generated": label == "llm"})
    with gzip.open("data/suite.jsonl.gz", "wt", encoding="utf8") as f:
        for it in items:
            f.write(json.dumps(it) + "\n")
    print(len(items), file=sys.stderr)


if __name__ == "__main__":
    main()
