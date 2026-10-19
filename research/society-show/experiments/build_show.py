"""Write experiments/robot_town_show.html and experiments/episodes.txt.

    PYTHONPATH=src python3 experiments/build_show.py

Deterministic (seeded): the same code and seeds give the same page byte for byte.
The page is a labelled simulation and fiction, with all data embedded (no network).
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from society_show import cast_for, mean, narrate, outcome, run_town, turning_points, avoiders  # noqa: E402

BASE = dict(n=48, rounds=400, start=60, length=50, e_bad=0.8, theta=0.3)
EPISODES = [
    ("dent", "Episode 1: The Dent", "Gossip is even-handed: good and bad news count the same.", dict(beta=1.0), 0),
    ("lockout", "Episode 2: The Lockout", "Bad news counts four times as much as good news.", dict(beta=4.0), 0),
    ("apology", "Episode 3: The Apology", "Bad news counts four times as much, but each robot explains its failures (they hurt trust 0.3 as much).",
     dict(beta=4.0, tau=0.3), 0),
    ("two-a", "Episode 4: Two Towns, One Ending", "Bad news counts twice as much. Seed 0.", dict(beta=2.0), 0),
    ("two-b", "Episode 5: Two Towns, Another Ending", "The same settings as episode 4, a different seed.", dict(beta=2.0), 1),
]


def build():
    eps, lines = [], []
    for slug, title, blurb, kw, seed in EPISODES:
        ep = run_town(seed=seed, **BASE, **kw)
        cast = cast_for(ep["n"], seed)
        pts = turning_points(ep)
        story = narrate(ep, cast, pts)
        res = outcome(ep)
        eps.append({"slug": slug, "title": title, "blurb": blurb, "seed": seed, "cast": cast,
                    "settings": {"beta": ep["beta"], "tau": ep["tau"], "theta": ep["theta"], "e_bad": ep["e_bad"],
                                 "start": ep["start"], "length": ep["length"], "rounds": ep["rounds"]},
                    "baseline": round(ep["baseline"], 3),
                    "trust": [[round(x * 100) for x in row] for row in ep["trust"]],
                    "story": [[r, s] for r, s in story], "outcome": res})
        lines.append(f"{title} | seed {seed} | {kw} | outcome {res}")
        lines += [f"  {s}" for _, s in story]
    res = ["== A. Mean trust in the robots by round (one run per episode)", "round " + " ".join(f"ep{k + 1}" for k in range(len(eps)))]
    for r in range(0, BASE["rounds"], 20):
        res.append(f"{r} " + " ".join(f"{sum(e['trust'][r]) / len(e['trust'][r]) / 100:.3f}" for e in eps))
    (HERE / "results.txt").write_text("\n".join(res) + "\n")
    template = (HERE / "show_template.html").read_text()
    html = template.replace("__DATA__", json.dumps(eps, separators=(",", ":")))
    (HERE / "robot_town_show.html").write_text(html)
    (HERE / "episodes.txt").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print("wrote robot_town_show.html", len(html) // 1024, "KiB")


if __name__ == "__main__":
    build()
