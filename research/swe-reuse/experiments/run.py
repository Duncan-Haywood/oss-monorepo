"""Reference-graph census.  python experiments/run.py > experiments/results.txt"""
import sys
from collections import Counter, defaultdict
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from swe_reuse import prefix, edges, wilson, expected_same_prefix, gini  # noqa: E402


def rows(name):
    return [l.split("\t") for l in (HERE.parent / "data" / name).read_text(encoding="utf-8").splitlines()[1:]]


proj = rows("projects.tsv")
created = {s: int(c) for s, c, _ in proj if c}
undated = [s for s, c, _ in proj if not c]
refs = defaultdict(set)
for a, b in rows("refs.tsv"):
    refs[a].add(b)
E = edges(refs, created)
fwd = sum(1 for a, bs in refs.items() for b in bs if a in created and b in created and created[b] > created[a])
tie = sum(1 for a, bs in refs.items() for b in bs if a in created and b in created and created[b] == created[a])
N = len(created)
print(f"projects with a creation date {N} (excluded, undated: {len(undated)}); reference pairs {sum(len(v) for v in refs.values())}")
print(f"  backward edges (cited project created strictly earlier) {len(E)}; forward {fwd}; same-second {tie}")

indeg = Counter(b for _, b in E)
outdeg = Counter(a for a, _ in E)
print("\nA. does an earlier project get built on? (inbound from a later project's README)")
k = sum(1 for s in created if indeg[s] > 0)
lo, hi = wilson(k, N)
print(f"  projects with >= 1 inbound {k}/{N} = {k/N:.1%}  [{lo:.1%}, {hi:.1%}]")
dist = Counter(min(indeg[s], 5) for s in created)
print("  inbound count distribution: " + ", ".join(f"{'5+' if d == 5 else d}: {dist[d]}" for d in range(6)))
print(f"  max inbound {max(indeg.values())}; Gini of inbound counts {gini([indeg[s] for s in created]):.2f}")
top = indeg.most_common(8)
print("  most-referenced: " + "; ".join(f"{s} ({n})" for s, n in top))
mature = [s for s in created if created[s] <= max(created.values()) - 7 * 86400]
km = sum(1 for s in mature if indeg[s] > 0)
lo, hi = wilson(km, len(mature))
print(f"  restricted to {len(mature)} projects at least 7 days old: {km} ({km/len(mature):.1%}) [{lo:.1%}, {hi:.1%}]")

print("\nB. who builds on whom: same track prefix or across tracks?")
same = sum(1 for a, b in E if prefix(a) == prefix(b))
exp = expected_same_prefix(E, created)
lo, hi = wilson(same, len(E))
print(f"  same-prefix edges {same}/{len(E)} = {same/len(E):.1%} [{lo:.1%}, {hi:.1%}]")
print(f"  expected if each citer cited uniformly among earlier projects: {exp:.0f} = {exp/len(E):.1%}")
print("  by track (projects with a date, share with >= 1 inbound, share of inbound that is same-prefix):")
byp = defaultdict(list)
for s in created:
    byp[prefix(s)].append(s)
for p, ss in sorted(byp.items(), key=lambda x: -len(x[1])):
    if len(ss) < 20:
        continue
    kk = sum(1 for s in ss if indeg[s] > 0)
    ins = [(a, b) for a, b in E if prefix(b) == p]
    sp = sum(1 for a, b in ins if prefix(a) == p)
    print(f"    {p:10s} {kk:3d}/{len(ss):3d} = {kk/len(ss):5.1%}   inbound {len(ins):4d}, same-prefix {sp/len(ins) if ins else 0:5.1%}")

print("\nC. how far back do references reach? (rank distance in creation order)")
order = {s: i for i, s in enumerate(sorted(created, key=lambda s: created[s]))}
gaps = sorted(order[a] - order[b] for a, b in E)
q = lambda f: gaps[int(f * (len(gaps) - 1))]
print(f"  median {q(.5)} projects back; 25% {q(.25)}; 75% {q(.75)}; 90% {q(.9)}")
hours = sorted((created[a] - created[b]) / 3600 for a, b in E)
print(f"  median {hours[len(hours)//2]:.1f} hours between cited and citing project's creation")

print("\nD. projects citing nothing earlier")
c0 = sum(1 for s in created if outdeg[s] == 0)
lo, hi = wilson(c0, N)
print(f"  {c0}/{N} = {c0/N:.1%} [{lo:.1%}, {hi:.1%}] name no earlier project in their README")
