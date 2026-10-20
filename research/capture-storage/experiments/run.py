"""Writes experiments/results.txt. Deterministic, stdlib only (well under a second).

    PYTHONPATH=src python experiments/run.py
"""
from pathlib import Path
from capture_storage import *
from capture_storage.model import CAMERAS

HERE = Path(__file__).resolve().parent
NAMES = list(CAMERAS)
out = []
P = out.append

P("== A. data rate per camera (GB per recording hour, high quality)")
for c in NAMES:
    P("%-16s %6.1f GB/h  battery %5.1f g/h  card %6.3f g/h  ratio %5.0f" % (
        c, gb_per_hour(CAMERAS[c]), battery_g_per_hour(c), storage_g_per_hour(c),
        battery_g_per_hour(c) / storage_g_per_hour(c)))

P("")
P("== B. rig size, 4 h/day for 7 days (n cameras taken in catalogue order, repeating the 360 camera)")
P("n  day_GB  trip_GB  cards_only_g  offload_g  cards ssds readers offload_h  exposed_GB")
base = ["360 camera", "action camera", "phone telephoto", "mirrorless body"]
for n in range(1, 9):
    cams = [base[i % 4] for i in range(n)]
    co = cards_only(cams, 4, 7)
    of = offload(cams, 4, 7)
    head = "%d  %6.0f  %7.0f  %12.1f" % (n, day_gb(cams, 4), day_gb(cams, 4) * 7, co.grams)
    P(head + ("  %9.1f  %5d %4d %7d %9.2f  %10.0f" % (of.grams, of.cards, of.ssds, of.readers, of.offload_h, of.exposed_gb)
              if of else "  infeasible within 8 readers"))

P("")
P("== C. evening offload time of a 4-camera rig against hours filmed per day, one reader, one copy")
P("hours_per_day  offload_h")
cams4 = base
for h in (1, 2, 3, 4, 6, 8):
    P("%13d  %9.2f" % (h, offload_hours(cams4, h)))

P("")
P("== D. bitrate scale (codec / quality setting) for the 4-camera rig, 4 h/day, 7 days, two SSD copies, 1 h limit")
P("scale  day_GB  grams readers offload_h")
for s in (0.25, 0.5, 0.75, 1.0, 1.5):
    of = offload(cams4, 4, 7, scale=s)
    P("%5.2f  %6.0f  %5.1f %7d %9.2f" % (s, day_gb(cams4, 4, s), of.grams, of.readers, of.offload_h))

P("")
P("== E. offload time limit for the 4-camera rig, 4 h/day, 7 days, two SSD copies")
P("limit_h  grams readers offload_h")
for lim in (0.5, 1.0, 2.0, 3.0, 4.0):
    of = offload(cams4, 4, 7, max_offload_h=lim)
    P("%7.1f  %5.1f %7d %9.2f" % (lim, of.grams, of.readers, of.offload_h) if of else "%7.1f  infeasible" % lim)

(HERE / "results.txt").write_text("\n".join(out) + "\n")
print("\n".join(out))
