#!/usr/bin/env python3
"""Compare cyclehound's graph with madge's or dependency-cruiser's.

  madge --extensions mjs --json ventures > madge.json
  cyclehound --graph --json --ext mjs --no-require ventures > ch.json
  python3 compare_graphs.py madge madge.json ch.json

  depcruise --no-config --output-type json ventures > dc.json
  cyclehound --graph --json --base . --no-type ventures > ch.json
  python3 compare_graphs.py depcruise dc.json ch.json

Prints node and edge counts, and up to 15 edges only one side has.
"""
import json
import sys


def edges_madge(path):
    g = json.load(open(path))
    return set(g), {(k, d) for k, v in g.items() for d in v}


def edges_depcruise(path):
    d = json.load(open(path))
    nodes, edges = set(), set()
    for m in d["modules"]:
        nodes.add(m["source"])
        for x in m["dependencies"]:
            if x.get("coreModule") or x.get("couldNotResolve"):
                continue
            if "node_modules" in x["resolved"]:
                continue
            edges.add((m["source"], x["resolved"]))
    return nodes, edges


def main():
    kind, ref, ours = sys.argv[1:4]
    rn, re_ = edges_madge(ref) if kind == "madge" else edges_depcruise(ref)
    on, oe = edges_madge(ours)
    print(f"{kind}: {len(rn)} nodes, {len(re_)} edges; cyclehound: {len(on)} nodes, {len(oe)} edges")
    print(f"common edges {len(re_ & oe)}; only {kind} {len(re_ - oe)}; only cyclehound {len(oe - re_)}")
    for label, s in ((f"only {kind}", re_ - oe), ("only cyclehound", oe - re_)):
        for e in sorted(s)[:15]:
            print(f"  {label}: {e[0]} -> {e[1]}")


if __name__ == "__main__":
    main()
