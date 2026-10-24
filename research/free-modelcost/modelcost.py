"""Opus vs Sonnet agent runs, compared inside matched strata (same date and track).

Reads prompts/runs/*.json (written by prompts/runcost.py). Stdlib only."""
import glob, json, math, random, statistics as st
from collections import defaultdict

METRICS = ("cost_usd", "tool_calls", "wall_minutes", "cost_per_call", "cache_read_per_call", "human_hours", "cost_per_human_hour")


def load(runs_dir):
    out = []
    for f in sorted(glob.glob(str(runs_dir) + "/*.json")):
        try:
            r = json.load(open(f))
        except ValueError:
            continue
        c, t = r.get("cost_usd"), r.get("tool_calls")
        if not isinstance(c, (int, float)) or c <= 0 or not r.get("date") or not r.get("track"):
            continue
        if r.get("model") not in ("claude-sonnet-5-5", "claude-opus-5-5"):
            continue
        he = ((r.get("usage") or {}).get("human_equivalent") or {}).get("hours")
        w = r.get("wall_minutes")
        cr = ((r.get("usage") or {}).get("totals") or {}).get("cache_read")
        ok = isinstance(t, (int, float)) and t > 0
        hh = isinstance(he, (int, float)) and he > 0
        out.append({
            "model": r["model"], "stratum": (r["date"], r["track"]), "cost_usd": c,
            "tool_calls": t if isinstance(t, (int, float)) and t > 0 else None,
            "wall_minutes": w if isinstance(w, (int, float)) and w > 0 else None,
            "cost_per_call": c / t if isinstance(t, (int, float)) and t > 0 else None,
            "cache_read_per_call": cr / t if ok and isinstance(cr, (int, float)) else None,
            "human_hours": he if hh else None,
            "cost_per_human_hour": c / he if hh else None,
        })
    return out


def strata(runs, metric):
    """{stratum: (opus values, sonnet values)} for strata holding both models."""
    g = defaultdict(lambda: ([], []))
    for r in runs:
        v = r[metric]
        if v is not None:
            g[r["stratum"]][0 if r["model"] == "claude-opus-5-5" else 1].append(v)
    return {k: v for k, v in g.items() if v[0] and v[1]}


def log_ratio(g):
    """Weighted mean over strata of log(median opus / median sonnet); weight = min(n_opus, n_sonnet)."""
    num = den = 0.0
    for o, s in g.values():
        w = min(len(o), len(s))
        num += w * math.log(st.median(o) / st.median(s))
        den += w
    return num / den


def compare(runs, metric, boot=2000, seed=1):
    g = strata(runs, metric)
    if not g:
        return None
    est = log_ratio(g)
    rng = random.Random(seed)
    reps = []
    for _ in range(boot):
        b = {k: ([rng.choice(o) for _ in o], [rng.choice(s) for _ in s]) for k, (o, s) in g.items()}
        reps.append(log_ratio(b))
    reps.sort()
    lo, hi = reps[int(.025 * boot)], reps[int(.975 * boot) - 1]
    return {"metric": metric, "strata": len(g), "n_opus": sum(len(o) for o, _ in g.values()),
            "n_sonnet": sum(len(s) for _, s in g.values()), "ratio": math.exp(est),
            "lo": math.exp(lo), "hi": math.exp(hi)}
