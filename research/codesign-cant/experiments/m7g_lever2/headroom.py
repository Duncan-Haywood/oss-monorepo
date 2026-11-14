"""Milestone 7g, post hoc (written after results.txt was read): how much torque headroom removes the lever-2 divergence, and does
a realisable mixer change (airmode: the collective may shift, `allocation.mix_priority(mode="free")`) buy the same?

results.txt: every lever-2 divergence is a tilt-over; the ideal mixer removes 67-78% of them and the ideal mixer with 2x torque
room removes all. Here the same designs, episodes and limits under: airmode; the ideal mixer with torque room 1.0, 1.25, 1.5, 2.0;
airmode with torque room 1.25 and 1.5 (more motor torque behind a real mixer; collective room is unchanged, so this is not a
bigger-motor redesign). Writes headroom.txt and headroom.json.
"""
import importlib.util, json, os, sys
from multiprocessing import Pool
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("m7g_run", os.path.join(HERE, "run.py"))   # run.py itself imports milestone 6's `run`
R = importlib.util.module_from_spec(_spec); sys.modules["m7g_run"] = R; _spec.loader.exec_module(R)

R.PROBES = {"base": {}, "airmode": dict(mix_mode="free"),
            **{f"ideal mixer, {r:g}x torque": dict(mixer_ideal=True, torque_room=r) for r in (1.0, 1.25, 1.5, 2.0)},
            **{f"airmode, {r:g}x torque": dict(mix_mode="free", torque_room=r) for r in (1.25, 1.5)}}

if __name__ == "__main__":
    jobs = [(g, c, p) for g in ("above", "below") for c in R.CAPS for p in R.PROBES]
    with Pool() as p:
        outs = p.map(R.job, jobs, chunksize=1)
    L = ["Milestone 7g post hoc: diverged held-out episodes (of 384 per set) at lever 2 under mixer and torque-headroom probes.", ""]
    for geom in ("above", "below"):
        for lab in ("unconstrained", "M=1.25", "M=1.43", "M=1.67"):
            rows = [o for o in outs if o["geom"] == geom]
            if lab not in rows[0]["labels"]:
                continue
            L.append(f"[{geom}, {lab}]")
            for cap in R.CAPS:
                cells = []
                for probe in R.PROBES:
                    o = next(r for r in rows if r["cap"] == cap and r["probe"] == probe)
                    i = [k for k, l in enumerate(o["labels"]) if l == lab]
                    cells.append(f"{probe} {int(np.asarray(o['dead'])[i].sum())} (pos {np.mean(np.asarray(o['pos'])[i]):.3f})")
                L.append(f"  cap {cap:2g}: " + "; ".join(cells))
            L.append("")
    open(os.path.join(HERE, "headroom.txt"), "w").write("\n".join(L) + "\n")
    json.dump(dict(probes=list(R.PROBES), runs=outs), open(os.path.join(HERE, "headroom.json"), "w"))
    print("\n".join(L))
