"""How much do the harmonised permit classes overlap between cities? (stdlib only)

Run: python3 src/class_overlap.py [--year 2024]

The H4 transfer model (src/transfer.py) shares one categorical feature across cities, the
keyword-harmonised class `cls`. If the cities' class distributions barely overlap, the
transfer model has to lean on the other four features (log cost, description length, month,
weekday), and H4 is a test of whether those transfer, not permit class.

Reads the `class_share_test` field each committed results/transfer_*.json carries (the held-out
city's test-year class shares) and `sources` (the cities that run trained on). For every held-out city h and target it builds the source mix
as the row-weighted mean of those source cities' test-year shares in the same year and target
(a proxy: the transfer model trains on years <= Y-2, whose shares are not stored in those
files), and reports the overlap coefficient sum_c min(p_h(c), p_src(c)) with and without the
"other" class. "other" is a catch-all that need not mean the same permits in two cities, so
the overlap without it is the part that is shared by construction.
Writes results/class_overlap_<year>.json and .md.
"""
import argparse, glob, json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
RES = os.path.join(HERE, "..", "results")


def overlap(p, q, drop=()):
    keys = (set(p) | set(q)) - set(drop)
    return sum(min(p.get(k, 0.0), q.get(k, 0.0)) for k in keys)


def mix(shares, weights):
    tot = float(sum(weights))
    out = {}
    for s, w in zip(shares, weights):
        for k, v in s.items():
            out[k] = out.get(k, 0.0) + v * w / tot
    return out


def load(year, res=RES):
    """{target: {city: (n_test, shares, sources)}}; prefers the four-city files when both exist."""
    rows = {}
    for f in sorted(glob.glob(os.path.join(res, f"transfer_*_{year}*.json"))):
        m = re.match(rf"transfer_(\w+?)_(a2i|i2c)_{year}(_4city)?\.json$", os.path.basename(f))
        if not m:
            continue
        r = json.load(open(f))
        city, target, four = m.group(1), m.group(2), bool(m.group(3))
        cur = rows.setdefault(target, {}).get(city)
        if cur is None or four:
            rows[target][city] = (r["n_test"], r["class_share_test"], r.get("sources"))
    return rows


def table(rows):
    out = []
    for target in sorted(rows):
        cities = rows[target]
        for h in sorted(cities):
            src = [c for c in (cities[h][2] or sorted(cities)) if c != h and c in cities]
            if not src:
                continue
            q = mix([cities[c][1] for c in src], [cities[c][0] for c in src])
            p = cities[h][1]
            top = max(p, key=p.get)
            out.append(dict(target=target, held_out=h, sources=src, n_test=cities[h][0],
                            overlap=overlap(p, q), overlap_no_other=overlap(p, q, drop=("other",)),
                            share_other=p.get("other", 0.0), top_class=top, top_share=p[top]))
    return out


def markdown(tab, year):
    lines = [f"# Harmonised class overlap between cities, test year {year}",
             "",
             "Made by `src/class_overlap.py` from the `class_share_test` field of `results/transfer_*.json`."
             " Source mix = row-weighted mean of the source cities' test-year shares (the cities that run trained on) (a proxy for the"
             " training years, which those files do not store). Overlap = sum over classes of"
             " min(held-out share, source share); 1 = identical mix, 0 = no class in common.",
             "",
             "| target | held out | sources | top class (share) | 'other' share | overlap | overlap without 'other' |",
             "|---|---|---|---|---|---|---|"]
    for r in tab:
        lines.append(f"| {r['target']} | {r['held_out']} | {', '.join(r['sources'])} | {r['top_class']} "
                     f"({r['top_share']:.2f}) | {r['share_other']:.2f} | {r['overlap']:.2f} | "
                     f"{r['overlap_no_other']:.2f} |")
    return "\n".join(lines) + "\n"


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=2024)
    a = ap.parse_args()
    tab = table(load(a.year))
    json.dump(tab, open(os.path.join(RES, f"class_overlap_{a.year}.json"), "w"), indent=1)
    md = markdown(tab, a.year)
    open(os.path.join(RES, f"class_overlap_{a.year}.md"), "w").write(md)
    print(md)
