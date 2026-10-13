"""Check session-written programs and injected-bug mutants at L0, L1, L2 against the held-out REF twin."""
import sys, json, pathlib, collections
root = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(root / "src"))
from robofab_program import check
from robofab_program.mutate import mutants

CHECKERS = ["L0", "L1", "L2"]
out = []

def verdicts(text, task):
    return {lv: check(text, task, lv) for lv in CHECKERS + ["REF"]}

out.append("== Session-written programs (drafts, then revisions after twin feedback) ==")
sw = []
for stage in ["drafts", "revised"]:
    for task in ["move", "wall", "heavy", "far"]:
        v = verdicts((root / "programs" / stage / f"{task}.rob").read_text(), task)
        row = {"stage": stage, "task": task, **{lv: v[lv]["pass"] for lv in v},
               "REF_violations": v["REF"]["violations"], "L2_violations": v["L2"]["violations"]}
        sw.append(row)
        out.append(f"{stage:8s} {task:6s} " + " ".join(f"{lv}={'pass' if v[lv]['pass'] else 'FAIL'}" for lv in v)
                   + f"  REF:{v['REF']['violations']}")

def confusion(rows, lv):
    c = collections.Counter()
    for r in rows:
        t, ref = r[lv], r["REF"]
        c["agree_pass" if t and ref else "caught" if (not t and not ref) else "false_alarm" if (not t and ref) else "missed"] += 1
    return c   # caught: twin and REF both fail; missed: twin passes, REF fails

rows = []
for task in ["move", "wall", "heavy"]:
    base = (root / "programs" / "revised" / f"{task}.rob").read_text()
    for (kind, label), text in mutants(base).items():
        try:
            v = verdicts(text, task)
        except ValueError:
            continue
        rows.append({"task": task, "kind": kind, "label": label, **{lv: v[lv]["pass"] for lv in v},
                     "REF_violations": v["REF"]["violations"]})
out.append(f"\n== Injected-bug mutants of the 3 revised programs that pass REF: {len(rows)} programs ==")
n_ref_fail = sum(not r["REF"] for r in rows)
out.append(f"REF fails {n_ref_fail}, REF passes {len(rows) - n_ref_fail}")
out.append("Twin FAIL = flagged. caught = twin fails & REF fails; missed = twin passes & REF fails; false alarm = twin fails & REF passes")
for lv in CHECKERS:
    c = confusion(rows, lv)
    out.append(f"{lv}: caught {c['caught']}/{n_ref_fail} ({c['caught']/max(n_ref_fail,1):.2f}), missed {c['missed']}, false alarms {c['false_alarm']}, agree-pass {c['agree_pass']}")
out.append("\nCatch rate by mutation kind (caught / REF-failing), and false alarms:")
for kind in sorted({r['kind'] for r in rows}):
    sub = [r for r in rows if r['kind'] == kind]
    nf = sum(not r["REF"] for r in sub)
    cells = []
    for lv in CHECKERS:
        c = confusion(sub, lv); cells.append(f"{lv} {c['caught']}/{nf} (FA {c['false_alarm']})")
    out.append(f"{kind:12s} n={len(sub):3d} REFfail={nf:3d}  " + "  ".join(cells))
out.append("\nREF failure reasons (mutants): " + str(dict(collections.Counter(
    v for r in rows for v in r["REF_violations"]))))
miss = [r for r in rows if r["L2"] and not r["REF"]]
out.append(f"\nL2 misses ({len(miss)}): " + "; ".join(f"{r['task']} {r['kind']} {r['label']} -> {r['REF_violations']}" for r in miss))
fa = [r for r in rows if not r["L2"] and r["REF"]]
out.append(f"L2 false alarms ({len(fa)}): " + "; ".join(f"{r['task']} {r['kind']} {r['label']}" for r in fa))
import dataclasses
from robofab_program import LEVELS
out.append("\n== Sensitivity: how many REF-failing mutants does L2 miss as REF is changed? (162 mutants) ==")
base = LEVELS["REF"]
def count_miss(ref):
    LEVELS["REF"] = ref
    m = f = 0
    for task in ["move", "wall", "heavy"]:
        b = (root / "programs" / "revised" / f"{task}.rob").read_text()
        for text in mutants(b).values():
            l2 = check(text, task, "L2")["pass"]; rf = check(text, task, "REF")["pass"]
            m += l2 and not rf; f += (not l2) and rf
    return m, f
for name, ref in [("REF as above", base),
                  ("no hidden offset", dataclasses.replace(base, cal_fixed=(0.0, 0.0))),
                  ("hidden offset x2", dataclasses.replace(base, cal_fixed=(0.003, -0.002))),
                  ("grip_wait 0.10 (= L2)", dataclasses.replace(base, grip_wait=0.10)),
                  ("grip_wait 0.25", dataclasses.replace(base, grip_wait=0.25)),
                  ("mu, force = L2", dataclasses.replace(base, mu=0.5, grip_force=20.0)),
                  ("flat payload", dataclasses.replace(base, payload="flat")),
                  ("repeat sigma = L2", dataclasses.replace(base, repeat_sigma=0.0005))]:
    m, f = count_miss(ref)
    out.append(f"{name:24s} L2 missed {m}, L2 false alarms {f}")
LEVELS["REF"] = base
(root / "experiments" / "results.txt").write_text("\n".join(out) + "\n")
(root / "experiments" / "results.json").write_text(json.dumps({"session_written": sw, "mutants": rows}, indent=1))
print("\n".join(out))
