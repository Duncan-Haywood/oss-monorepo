"""Summarise smt.jsonl (depth-24 BMC, 10 targets) and sweep.jsonl (depth sweep) into results.txt. Stdlib only."""
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))


def load(name):
    return [json.loads(l) for l in open(os.path.join(HERE, name))]


def last_pass(rows, mid):
    """((deepest depth that finished with 'pass', its seconds), first timeout depth or None) for one target."""
    ok = [r for r in rows if r["id"] == mid and r["verdict"] == "pass"]
    to = [r for r in rows if r["id"] == mid and r["verdict"] == "timeout"]
    best = max(ok, key=lambda r: r["depth"]) if ok else None
    return ((best["depth"], best["seconds"]) if best else (0, 0.0)), (min(r["depth"] for r in to) if to else None)


def main():
    smt, sw = load("smt.jsonl"), load("sweep.jsonl")
    o = ["== A. depth-24 BMC (yosys-smtbmc + z3), %d undecided targets, 900 s limit each" % len(smt)]
    for v in ("pass", "fail", "timeout"):
        o.append(f"bmc={v}: {sum(r['bmc'] == v for r in smt)}")
    o.append(f"induction attempted: {sum(r['induct'] != 'skipped' for r in smt)}")
    o += ["", "== B. depth sweep (240 s limit)", "target (deepest depth finished, seconds) first_timeout_depth"]
    for mid in dict.fromkeys(r["id"] for r in sw):
        o.append(f"{mid} {last_pass(sw, mid)[0]} {last_pass(sw, mid)[1]}")
    o += ["", "every sweep point:"]
    for r in sw:
        o.append(f"  {r['id']} depth={r['depth']} {r['verdict']} {r['seconds']} s")
    if os.path.exists(os.path.join(HERE, "wordlevel.jsonl")):
        o += ["", "== C. word-level encoding (no memory_map), z3, 240 s limit"]
        for r in load("wordlevel.jsonl"):
            o.append(f"  {r['id']} depth={r['depth']} {r['verdict']} {r['seconds']} s")
    open(os.path.join(HERE, "results.txt"), "w").write("\n".join(o) + "\n")
    print("\n".join(o))


if __name__ == "__main__":
    main()
