"""Model-mix statistics for agent runs. Pure standard library."""
import json
import math
import random
import statistics


def load(path):
    with open(path) as f:
        return [json.loads(line) for line in f if line.strip()]


def boot_ratio_of_medians(a, b, reps=4000, seed=1):
    """median(a)/median(b) with a 95% percentile-bootstrap interval."""
    rng = random.Random(seed)
    point = statistics.median(a) / statistics.median(b)
    rs = sorted(statistics.median(rng.choices(a, k=len(a))) /
                statistics.median(rng.choices(b, k=len(b))) for _ in range(reps))
    return point, rs[int(0.025 * reps)], rs[int(0.975 * reps) - 1]


def by_model_track(runs):
    """{track: {model: [cost, ...]}} for priced runs with a named model."""
    out = {}
    for r in runs:
        if r.get("cost_usd") is None or not r.get("model"):
            continue
        out.setdefault(r["track"], {}).setdefault(r["model"], []).append(r["cost_usd"])
    return out


def runs_needed(cv, rel_diff, z_alpha=1.96, z_power=0.8416):
    """Runs per arm to detect a relative difference `rel_diff` in mean value per
    run when per-run value has coefficient of variation `cv` (two-sided 5%, 80% power)."""
    return math.ceil(2 * ((z_alpha + z_power) * cv / rel_diff) ** 2)


def project_cv(runs):
    """Coefficient of variation of projects landed per run, for runs that report it."""
    xs = [r["n_projects"] for r in runs if r.get("n_projects") is not None]
    m = statistics.mean(xs)
    return statistics.pstdev(xs) / m if m else float("nan"), len(xs)
