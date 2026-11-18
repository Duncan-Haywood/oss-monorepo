"""Compare the selectors PurgeCSS and csshound reject, page by page.

    node tests/bench/purgecss_pages.mjs <purgecss dir> ventures > purge.jsonl
    csshound --purgecss --json ventures > hound.jsonl
    python3 tests/bench/compare_rejected.py purge.jsonl hound.jsonl

Prints the pages each tool saw, the selectors both rejected, the ones only
one rejected, and the first few differences so they can be explained.
"""
import json
import sys


def load(path):
    out = {}
    with open(path, encoding="utf-8") as f:
        for line in f:
            d = json.loads(line)
            out[d["page"]] = set(d.get("rejected", [])) if "error" not in d else None
    return out


def main(a_path, b_path, show=15):
    a, b = load(a_path), load(b_path)
    errors = [p for p, v in a.items() if v is None]
    pages = sorted((set(a) & set(b)) - set(errors))
    both = only_a = only_b = 0
    diffs = []
    for p in pages:
        both += len(a[p] & b[p])
        for s in sorted(a[p] - b[p]):
            only_a += 1
            diffs.append(("only purgecss", p, s))
        for s in sorted(b[p] - a[p]):
            only_b += 1
            diffs.append(("only csshound", p, s))
    print(f"pages: purgecss {len(a)} ({len(errors)} errors), csshound {len(b)}, compared {len(pages)}")
    print(f"pages only one saw: purgecss {len(set(a) - set(b))}, csshound {len(set(b) - set(a))}")
    print(f"rejected by both {both}; only purgecss {only_a}; only csshound {only_b}")
    for kind, p, s in diffs[:show]:
        print(f"  {kind}: {p}: {s}")
    return 0 if not diffs else 1


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:3]))
