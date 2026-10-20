"""Write experiments/plaza_replay.html: a seeded, self-contained browser replay of one run.

    PYTHONPATH=src python3 experiments/replay.py [rho] [policy] [seed]

Defaults: 30% committed-left robots, seed 7, 150 s. The page embeds the trajectories (no network).
It is a labelled simulation of invented stylised walkers, not footage of anything.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_plaza import LEN, WID, run  # noqa: E402

rho = float(sys.argv[1]) if len(sys.argv) > 1 else 0.3
policy = sys.argv[2] if len(sys.argv) > 2 else "left"
seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7
r = run(n=60, rho=rho, policy=policy, m=9, seed=seed, seconds=150.0, record_every=0.25)
frames = [[[round(x * 10), round(y * 10)] for (x, y, d, rb, side) in f] for t, f in r["frames"]]
meta = [[d, rb] for (x, y, d, rb, side) in r["frames"][0][1]]
sides = [[side for (x, y, d, rb, side) in f] for t, f in r["frames"]]
data = {"len": LEN, "wid": WID, "dt": 0.25, "meta": meta, "pos": frames, "sides": sides,
        "rho": rho, "policy": policy, "seed": seed}
html = (HERE / "replay_template.html").read_text().replace("__DATA__", json.dumps(data, separators=(",", ":")))
(HERE / "plaza_replay.html").write_text(html)
print("wrote", HERE / "plaza_replay.html", len(html) // 1024, "KiB")
