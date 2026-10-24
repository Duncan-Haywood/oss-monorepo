"""Summarise mutants.jsonl into results.txt: how many eda-verify mutants the golden-free properties kill."""
import json, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
R = [json.loads(l) for l in open(os.path.join(HERE, "mutants.jsonl"))]
meta = json.load(open(os.path.join(HERE, "meta.json")))
names = ("latency", "pulse", "hold", "repeat", "glitch", "abort")
K = [r for r in R if r["truth"] == "killable"]; E = [r for r in R if r["truth"] == "equivalent"]
U = [r for r in R if r["truth"] == "undecided"]
L = [f"tools: {meta['tools']}", f"design: p=8, wb=4 MAC accelerator, spec latency {meta['latency']} cycles; "
     f"property run = 32 plain + 8 glitch + 8 abort + 8 plain vectors; golden passes in {meta['golden_pass_seconds']:.2f} s",
     f"mutants: {len(R)} (killable {len(K)}, proved equivalent {len(E)}, undecided {len(U)}; ground truth from eda-verify)"]
anyp = lambda r: bool(r["violated"])
L.append(f"\ngolden-free properties (any) kill {sum(map(anyp, K))}/{len(K)} killable mutants = {sum(map(anyp, K))/len(K):.3f}")
L.append(f"violations on mutants proved equivalent: {sum(map(anyp, E))}/{len(E)}; on undecided: {sum(map(anyp, U))}/{len(U)}")
L.append("\nper property (killable mutants it violates; violated alone):")
for n in names:
    k = sum(n in r["violated"] for r in K); a = sum(r["violated"] == [n] for r in K)
    L.append(f"  {n:8s} {k:3d}  alone {a:3d}")
L.append("\nby kind (killed / killable):")
for kind in sorted({r["kind"] for r in R}):
    kk = [r for r in K if r["kind"] == kind]; L.append(f"  {kind}: {sum(map(anyp, kk))}/{len(kk)}")
gf = {r["id"] for r in K if anyp(r)}
rn = {r["id"] for r in K if r["random64_any"]}; dr = {r["id"] for r in K if r["directed16"]}
L.append(f"\noverlap with golden-based checks over the {len(K)} killable: random-64 (any seed) {len(rn)}, directed-16 {len(dr)}")
L.append(f"  golden-free only (not directed-16): {len(gf - dr)}; directed-16 only: {len(dr - gf)}; both: {len(gf & dr)}; neither: {len(K) - len(gf | dr)}")
miss = [r for r in K if not anyp(r)]
L.append(f"killable mutants the properties miss ({len(miss)}): " + ", ".join(r["id"] for r in miss))
L.append(f"\nsignature counts: {dict(Counter(tuple(r['violated']) for r in K))}")
t = sum(r["prop_seconds"] for r in K) / len(K)
L.append(f"CPU seconds per mutant for the property run: {t:.2f}; kills per CPU-minute: {60 * len(gf) / sum(r['prop_seconds'] for r in K):.1f}")
open(os.path.join(HERE, "results.txt"), "w").write("\n".join(L) + "\n"); print("\n".join(L))
