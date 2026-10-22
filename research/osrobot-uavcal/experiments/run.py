import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from osrobot_uavcal.cal import *

out = []
out.append("# model constants: FM=%.2f eta_drive=%.4f P_avionics=%.1f W CDA_K=%.3f" % (M.FM, M.ETA_DRIVE, M.P_AVIONICS, M.CDA_K))
out.append("# endurance_model/endurance_published; >1 means the model is optimistic")
for name, m, wh, t, v in AIRCRAFT:
    out.append("")
    out.append("%s  mass %.3f kg  pack %.1f Wh  published %.0f min  speed %s" % (
        name, m, wh, t, "model best-range" if v is None else "%.2f m/s" % v))
    out.append("usable  " + "  ".join("d=%.2f" % d for d in DIAMS))
    for u in USABLE:
        row = []
        for d in DIAMS:
            e, vv = endurance_min(m, wh, d, v, u)
            row.append("%6.2f" % (e / t))
        out.append("%.2f    " % u + "  ".join(row))
    e, vv = endurance_min(m, wh, 0.22, v, 0.9)
    out.append("at d=0.22 usable=0.90: model speed %.1f m/s, endurance %.1f min, hover power %.1f W" % (
        vv, e, M.hover_power(m, 0.22)))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write("\n".join(out) + "\n")
print("\n".join(out))

more = ["", "# rotor diameter (m) at which the model reproduces the published endurance"]
for name, m, wh, t, v in AIRCRAFT:
    more.append(name + "  " + "  ".join(
        "usable %.2f: %s" % (u, "%.3f" % matching_diameter(m, wh, t, v, u) if matching_diameter(m, wh, t, v, u) else "none")
        for u in USABLE))
open(os.path.join(os.path.dirname(__file__), "results.txt"), "a").write("\n".join(more) + "\n")
print("\n".join(more))
