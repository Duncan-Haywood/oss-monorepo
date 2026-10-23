"""Run every N-1 outage on five MATPOWER cases; write experiments/results.txt."""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from infra_n1screen import run_case, screen_table, recall_at_k  # noqa: E402

HEAD = [0.1, 0.25, 0.5, 1.0]
out = []
w = out.append
w("case  branches headroom ac_insecure dc_flagged TP FP FN TN miss% falsealarm% volt_only nonconv dc_fail  recall@10")
for name in ["case14", "case30", "case39", "case57", "case118"]:
    t0 = time.time()
    res = run_case(name)
    for h in HEAD:
        t = screen_table(res, h)
        ins, flg = t["tp"] + t["fn"], t["tp"] + t["fp"]
        miss = 100.0 * t["fn"] / ins if ins else float("nan")
        fa = 100.0 * t["fp"] / flg if flg else float("nan")
        w(f"{name} {t['n']} {h} {ins} {flg} {t['tp']} {t['fp']} {t['fn']} {t['tn']} {miss:.1f} {fa:.1f} "
          f"{t['volt_only']} {t['nonconv']} {t['dc_fail']} {recall_at_k(t['pairs'], 10):.2f}")
        # DC margin sweep and MW-only AC basis, at this headroom
    for h in (0.25,):
        for m in (0.8, 0.9, 1.0):
            t = screen_table(res, h, screen_margin=m)
            ins = t["tp"] + t["fn"]
            w(f"#margin {name} headroom={h} screen_margin={m} miss={100.0*t['fn']/max(ins,1):.1f}% "
              f"fp={t['fp']} fn={t['fn']}")
        tp_ = screen_table(res, h, ac_basis="P")
        ins = tp_["tp"] + tp_["fn"]
        w(f"#acP {name} headroom={h} AC judged on MW only: insecure={ins} miss={100.0*tp_['fn']/max(ins,1):.1f}% "
          f"fp={tp_['fp']} fn={tp_['fn']}")
    print(name, round(time.time() - t0, 1), "s", file=sys.stderr)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))
