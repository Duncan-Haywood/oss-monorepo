"""Joint kit + storage search against kit-only search, and sensitivity sweeps. Writes results.txt.

    PYTHONPATH=src python experiments/run.py
"""
from pathlib import Path
from capture_kitstore import (all_kits, exact_joint, total_grams, storage, describe, variety, hours, kit_grams, BITRATE,
                              BITRATE_STATUS)
from capture_kitstore.catalogue import exact as exact_kit

HERE = Path(__file__).resolve().parent
BUDGETS = (1000, 1500, 2000, 3000, 4000, 5000, 7000)
MINH = 4.0


def main():
    kits = list(all_kits())
    out = [f"kits: {len(kits)}; recording floor {MINH} h/day, 7 days, 2 SSD copies, offload within 1 h, UHS-I ceiling 104 MB/s"]
    out.append("A. kit-only (realkit) vs joint kit+storage, by total carried weight")
    out.append("budget_g  kitonly_var kitonly_g storage_for_it_g kitonly_total_g fits  joint_var joint_total_g storage_g readers ssds")
    detail = []
    for b in BUDGETS:
        ko = exact_kit(b, kits, MINH)
        jk = exact_joint(b, kits, MINH)
        row = f"{b:<9d} "
        if ko:
            st = storage(ko, MINH)
            tot = total_grams(ko, st) if st else None
            row += f"{variety(ko):<11d} {kit_grams(ko):<9d} {('%.0f' % st.grams) if st else 'infeasible':<16} {('%.0f' % tot) if tot else '-':<15} {str(bool(tot) and tot <= b):<5} "
        else:
            row += f"{'none':<11} {'-':<9} {'-':<16} {'-':<15} {'-':<5} "
        if jk[0]:
            k, s = jk
            row += f"{variety(k):<9d} {total_grams(k, s):<13.0f} {s.grams:<9.0f} {s.readers:<7d} {s.ssds}"
            detail.append(f"{b} g joint: {describe(k)} | {s.cards} cards, {s.ssds} SSDs, {s.readers} readers, {s.day_gb:.0f} GB/day, copy {s.offload_h:.2f} h")
        else:
            row += "none"
        out.append(row)
        if ko:
            detail.append(f"{b} g kit-only: {describe(ko)}")
    out.append("B. kits chosen")
    out += detail
    out.append("C. joint variety at each budget as the bitrate scale moves (1.0 = figures above), reader ceiling 104 MB/s")
    scales = (0.25, 0.5, 1.0, 1.5)
    out.append("budget_g  " + "  ".join(f"x{s}" for s in scales))
    for b in BUDGETS:
        vs = []
        for s in scales:
            k = exact_joint(b, kits, MINH, scale=s)[0]
            vs.append(str(variety(k)) if k else "-")
        out.append(f"{b:<9d} " + "  ".join(f"{v:<4}" for v in vs))
    out.append("D. joint variety by reader speed (MB/s): 90 assumed, 104 UHS-I ceiling, 312 UHS-II ceiling")
    out.append("budget_g  90  104  312")
    for b in BUDGETS:
        vs = []
        for r in (90.0, 104.0, 312.0):
            k = exact_joint(b, kits, MINH, reader_mbs=r)[0]
            vs.append(str(variety(k)) if k else "-")
        out.append(f"{b:<9d} " + "  ".join(f"{v:<4}" for v in vs))
    out.append("F. lightest total carried weight (g, 25 g steps) that reaches all 18 shots, kit-only vs with storage counted")
    out.append("bitrate_scale  kit_only_g  joint_g")
    for sc in (0.25, 0.5, 1.0, 1.5):
        res = []
        for ws in (False, True):
            r = "-"
            for b in range(1000, 9001, 25):
                k = exact_joint(b, kits, MINH, with_storage=ws, scale=sc)[0]
                if k and variety(k) == 18:
                    r = str(b)
                    break
            res.append(r)
        out.append(f"{sc:<14} {res[0]:<11} {res[1]}")
    out.append("E. bitrates (Mbit/s): " + "; ".join(f"{k} {v:g} ({BITRATE_STATUS[k]})" for k, v in BITRATE.items()))
    (HERE / "results.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
