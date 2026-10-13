"""Does the fine-mesh peak depend on the number of facets of the polygonal fillet? Three gauge-2 designs
(rules seeds 1, 2, 4 of results.json), n_arc in 24, 96, 384 at h = 1.0 and 0.75 mm (peak von Mises, MPa).
Writes arc.txt."""
import functools, json, os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from simdesign_gaugemesh import PROCESSES, evaluate, Params, model

OUT = os.path.dirname(os.path.abspath(__file__))
res = json.load(open(os.path.join(OUT, "results.json")))
orig = model.build_polygon
L = ["peak von Mises (MPa) of gauge-2 laser designs vs polygon-fillet facets n_arc; columns h = 2.5, 1.0, 0.75 mm"]
for seed in (1, 2, 4):
    d = next(x for x in res if x["kind"] == "rules" and x["seed"] == seed)
    for n in (24, 96, 384):
        model.build_polygon = functools.partial(orig, n_arc=n)
        pk = [evaluate(PROCESSES["laser cutting"], Params(w=d["w"], r=d["r"], b=d["b"]), h=h)["fe"]["peak_mpa"] for h in (2.5, 1.0, 0.75)]
        L.append(f"seed {seed} (w={d['w']:.1f}, r={d['r']:.1f}) n_arc={n:3d}: " + " ".join(f"{v:.1f}" for v in pk))
open(os.path.join(OUT, "arc.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
