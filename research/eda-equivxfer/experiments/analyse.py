"""Writes results.txt from mac_sig.jsonl, systolic.jsonl and meta.json. Stdlib only; no tool is run."""
import json, os, sys
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from eda_equivxfer import analyse as A, netlist

meta = json.load(open(os.path.join(HERE, "meta.json")))
load = lambda f: [json.loads(l) for l in open(os.path.join(HERE, f))]
out = []; p = out.append
p(f"# {meta['tools']['yosys']}; {meta['tools']['iverilog']}")
s = meta["systolic"]
p(f"# systolic {s['r']}x{s['c']} (rows x columns) wb={s['wb']}: {s['n_enumerated']} mutants enumerated, {s['n_sampled']} sampled, {s['n_compile']} compile, "
  f"{s['n_survive']} survive {s['sim_batches']} random batches; formal timeouts {s['induct_timeout']}s induction / {s['sat_timeout']}s SAT, bound {s['bound_cycles']} cycles")
for name, rows, gold in (("A: chip-accel MAC p=8 (27 survivors, formal from eda-verify, 150/240 s timeouts)", load("mac_sig.jsonl"), meta["mac"]["golden_sig"]),
                         ("B: chip-systolic (formal here, 60/120 s timeouts)", load("systolic.jsonl"), s["golden_sig"])):
    p(""); p(f"== {name}")
    p(f"formal verdicts: {dict(Counter(r['formal'] for r in rows))}; golden cells {sum(gold.values())}")
    c = A.confusion(rows, gold)
    for k in ("same", "differs"):
        p(f"  signature {k:8s}: {c[k]}")
    d = [netlist.delta(gold, r['sig']) for r in rows]
    for v in ("equivalent", "killed", "undecided"):
        ds = sorted(x for x, r in zip(d, rows) if r["formal"] == v and x is not None)
        p(f"  cell delta, {v:10s}: n={len(ds)} {ds}")
    k = A.cost(rows, gold)
    p(f"  cpu-s: formal on all survivors {k['formal_all']:.0f}; signatures for all {k['signature_all']:.0f}; formal skipped where signature matches {k['formal_saved']:.0f}")
    p(f"  mean s: signature {sum(r['sig_seconds'] for r in rows)/len(rows):.1f}; formal {sum(r['formal_seconds'] for r in rows)/len(rows):.0f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
