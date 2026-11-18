"""Which classes do the description rules confuse, and does that error move the transfer overlap? (session 72)

Stdlib only; reads committed files, needs no feed:
  python3 src/desc_confusion.py [--boot 2000] [--seed 20261110]

Inputs: `results/desc_rules_eval.json` (session 71: every hand-labelled row's (label, v1, v2)
codes) and the Seattle 2024 transfer files (`results/transfer_seattle_{a2i,i2c}_2024_4city*.json`:
the test-year class shares under the type-only and cascade2 class maps, and the source cities'
training-year shares).

Two parts.

1. Per-class confusion. For each split (dev 2023, held-out 2022), city and rule version: the
   confusion matrix (label by prediction), per-class precision and recall with Wilson 95%
   intervals, and the label/prediction pairs that account for most errors.

2. A misclassification-corrected Seattle overlap. Session 71 reported Seattle's a2i class overlap
   with its sources, without "other", as 0.501 under cascade2. Those shares count the rules'
   predictions, and the rules are wrong on about 1 row in 20 in Seattle (held out). Seattle's
   permit type names only demolition; every other non-"other" class comes from the description.
   So the test shares split into a structured part (the type-only run's non-"other" shares) and a
   description part (cascade2 minus the structured part, which sums to the type-only run's
   "other" share). The description part is corrected with the held-out Seattle rows'
   P(label | prediction): q(i) = sum_j d(j) P(label=i | pred=j), the posterior form of an
   adjusted classify-and-count (Forman 2008). Bootstrapping the 150 labelled rows gives an
   interval. Assumptions: the 2022 labelled rows (type-other applications, the first rows
   Socrata returns at the chosen offsets) stand for the 2024 test rows' description part, and
   the source side is left uncorrected (Chicago's a2i classes are also description-based, with
   85% held-out agreement; SF and Austin come from structured fields).

Predictions, written before this script was first run (session 72):
  (Q1) Held-out v2: Seattle recall of new_construction is at least 0.80, and alteration
       precision is at least 0.85 in both cities.
  (Q2) The corrected Seattle a2i overlap without "other" is within 0.05 of the uncorrected one
       (0.501), and its bootstrap 95% interval lies inside [0.40, 0.60]: in Seattle the rules'
       error is too small to move the overlap that session 71's transfer result rests on.

Post hoc (added after the first run showed the Seattle-side correction cannot move the overlap:
Seattle's alteration, new-construction and demolition shares all exceed the sources', so every
min() in the overlap takes the source share): 3. a source-side bound for a2i, whose sources include
Chicago, also classed from its descriptions. The source shares are shifted by
f * (label share - prediction share) of the held-out Chicago rows, with f = Chicago's a2i rows over
the a2i source pool (852,266 / 4,060,329 = 0.21, `results/manifest.json` and the transfer file;
an upper bound, since the pool holds only training years), bootstrapped over the Chicago rows.
Writes results/desc_confusion.json and results/desc_confusion.md.
"""
import argparse, json, os, random, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from desc_eval import CODES, wilson  # noqa: E402
from class_overlap import overlap  # noqa: E402

RES = os.path.join(HERE, "..", "results")
CLASSES = list(CODES.values())


def pairs(rows, version):
    """(label, prediction) class names from the 'LVW' code strings; version 1 or 2."""
    return [(CODES[r[0]], CODES[r[version]]) for r in rows]


def confusion(pr):
    m = {a: {b: 0 for b in CLASSES} for a in CLASSES}
    for h, p in pr:
        m[h][p] += 1
    return m


def per_class(pr):
    out = {}
    for c in CLASSES:
        tp = sum(h == p == c for h, p in pr)
        npred = sum(p == c for _, p in pr)
        nlab = sum(h == c for h, _ in pr)
        if not (npred or nlab):
            continue
        out[c] = dict(n_label=nlab, n_pred=npred,
                      precision=tp / npred if npred else None, precision_ci95=wilson(tp, npred),
                      recall=tp / nlab if nlab else None, recall_ci95=wilson(tp, nlab))
    return out


def top_errors(pr, k=5):
    cnt = {}
    for h, p in pr:
        if h != p:
            cnt[(h, p)] = cnt.get((h, p), 0) + 1
    return [dict(label=h, pred=p, n=n) for (h, p), n in sorted(cnt.items(), key=lambda t: (-t[1], t[0]))[:k]]


def posterior(pr):
    """P(label | pred) as {pred: {label: p}}; a prediction never seen keeps itself."""
    out = {}
    for c in CLASSES:
        labs = [h for h, p in pr if p == c]
        out[c] = {l: labs.count(l) / len(labs) for l in set(labs)} if labs else {c: 1.0}
    return out


def split_shares(type_shares, casc_shares):
    """Structured part (type-only non-'other') and description part (cascade minus structured, >= 0)."""
    struct = {c: v for c, v in type_shares.items() if c != "other" and v > 0}
    desc = {c: max(0.0, v - struct.get(c, 0.0)) for c, v in casc_shares.items()}
    return struct, desc


def corrected(struct, desc, post):
    q = dict(struct)
    for j, w in desc.items():
        for i, p in post[j].items():
            q[i] = q.get(i, 0.0) + w * p
    tot = sum(q.values())
    return {c: v / tot for c, v in q.items()}


def quantile(xs, a):
    xs = sorted(xs)
    k = (len(xs) - 1) * a
    lo = int(k)
    return xs[lo] + (xs[min(lo + 1, len(xs) - 1)] - xs[lo]) * (k - lo)


def overlap_part(target, pr, boot, seed, res=RES):
    t = json.load(open(os.path.join(res, f"transfer_seattle_{target}_2024_4city.json")))
    c2 = json.load(open(os.path.join(res, f"transfer_seattle_{target}_2024_4city_cascade2.json")))
    src = c2["class_share_source_train"]
    struct, desc = split_shares(t["class_share_test"], c2["class_share_test"])
    raw = c2["class_share_test"]
    q = corrected(struct, desc, posterior(pr))
    rng = random.Random(seed)
    bs = []
    for _ in range(boot):
        b = [pr[rng.randrange(len(pr))] for _ in pr]
        bs.append(overlap(corrected(struct, desc, posterior(b)), src, drop=("other",)))
    return dict(target=target, n_test=c2["n_test"], structured_share=sum(struct.values()),
                description_share=sum(desc.values()),
                shares_uncorrected=raw, shares_corrected=q, shares_source_train=src,
                overlap_no_other_uncorrected=overlap(raw, src, drop=("other",)),
                overlap_no_other_corrected=overlap(q, src, drop=("other",)),
                overlap_no_other_corrected_ci95=[quantile(bs, 0.025), quantile(bs, 0.975)],
                overlap_uncorrected=overlap(raw, src), overlap_corrected=overlap(q, src))


CHICAGO_A2I_ROWS = 852266  # results/manifest.json, both_applied_issued


def source_bound(o, pr, n_source, boot, seed):
    """a2i overlap without 'other' after shifting the source shares by Chicago's rule error."""
    f = min(1.0, CHICAGO_A2I_ROWS / n_source)

    def shifted(b):
        n = len(b)
        src = dict(o["shares_source_train"])
        for c in CLASSES:
            d = (sum(h == c for h, _ in b) - sum(p == c for _, p in b)) / n
            src[c] = max(0.0, src.get(c, 0.0) + f * d)
        tot = sum(src.values())
        return {c: v / tot for c, v in src.items()}

    q = o["shares_corrected"]
    rng = random.Random(seed + 1)
    bs = [overlap(q, shifted([pr[rng.randrange(len(pr))] for _ in pr]), drop=("other",)) for _ in range(boot)]
    s = shifted(pr)
    return dict(chicago_fraction_upper=f, shares_source_shifted=s,
                overlap_no_other=overlap(q, s, drop=("other",)), overlap_no_other_ci95=[quantile(bs, 0.025), quantile(bs, 0.975)])


def run(boot=2000, seed=20261110, res=RES):
    ev = json.load(open(os.path.join(res, "desc_rules_eval.json")))
    out = dict(boot=boot, seed=seed, confusion={}, overlap={})
    for split in ("dev", "held_out"):
        for city, r in ev[split]["cities"].items():
            for v in (1, 2):
                pr = pairs(r["rows"], v)
                out["confusion"][f"{split}/{city}/v{v}"] = dict(
                    n=len(pr), matrix=confusion(pr), per_class=per_class(pr), top_errors=top_errors(pr))
    pr = pairs(ev["held_out"]["cities"]["seattle"]["rows"], 2)
    for target in ("a2i", "i2c"):
        out["overlap"][target] = overlap_part(target, pr, boot, seed, res)
    t = json.load(open(os.path.join(res, "transfer_seattle_a2i_2024_4city_cascade2.json")))
    out["overlap"]["a2i"]["source_bound"] = source_bound(
        out["overlap"]["a2i"], pairs(ev["held_out"]["cities"]["chicago"]["rows"], 2), t["n_source_train"], boot, seed)
    pc = out["confusion"]["held_out/seattle/v2"]["per_class"]
    alt = [out["confusion"][f"held_out/{c}/v2"]["per_class"]["alteration"]["precision"] for c in ("chicago", "seattle")]
    o = out["overlap"]["a2i"]
    out["predictions"] = dict(
        Q1=dict(seattle_new_recall=pc["new_construction"]["recall"], alteration_precision=alt,
                held=pc["new_construction"]["recall"] >= 0.80 and min(alt) >= 0.85),
        Q2=dict(uncorrected=o["overlap_no_other_uncorrected"], corrected=o["overlap_no_other_corrected"],
                ci95=o["overlap_no_other_corrected_ci95"],
                held=abs(o["overlap_no_other_corrected"] - o["overlap_no_other_uncorrected"]) <= 0.05
                and 0.40 <= o["overlap_no_other_corrected_ci95"][0] and o["overlap_no_other_corrected_ci95"][1] <= 0.60))
    return out


def fmt(x):
    return "-" if x is None else "%.2f" % x


def markdown(out):
    L = ["# Description rules: per-class confusion and a corrected Seattle overlap (`src/desc_confusion.py`)", ""]
    for key in ("held_out/chicago/v2", "held_out/seattle/v2", "held_out/chicago/v1", "held_out/seattle/v1"):
        r = out["confusion"][key]
        L += [f"## {key} (n = {r['n']})", "", "| class | labelled | predicted | precision [95%] | recall [95%] |",
              "|---|---|---|---|---|"]
        for c, s in r["per_class"].items():
            pci, rci = s["precision_ci95"], s["recall_ci95"]
            L.append(f"| {c} | {s['n_label']} | {s['n_pred']} | {fmt(s['precision'])} [{fmt(pci[0])}, {fmt(pci[1])}] "
                     f"| {fmt(s['recall'])} [{fmt(rci[0])}, {fmt(rci[1])}] |")
        L += ["", "Most frequent errors (label -> prediction): " +
              "; ".join(f"{e['label']} -> {e['pred']} ({e['n']})" for e in r["top_errors"]), ""]
    L += ["## Seattle 2024 test shares corrected for rule error (held-out Seattle P(label | prediction))", "",
          "| target | description part | overlap w/o other, as run | corrected [95% bootstrap] | overlap with other, as run | corrected |",
          "|---|---|---|---|---|---|"]
    for t, o in out["overlap"].items():
        ci = o["overlap_no_other_corrected_ci95"]
        L.append(f"| {t} | {o['description_share']:.3f} | {o['overlap_no_other_uncorrected']:.3f} | "
                 f"{o['overlap_no_other_corrected']:.3f} [{ci[0]:.3f}, {ci[1]:.3f}] | {o['overlap_uncorrected']:.3f} | "
                 f"{o['overlap_corrected']:.3f} |")
    L += ["", "| target | class | as run | corrected | sources |", "|---|---|---|---|---|"]
    for t, o in out["overlap"].items():
        for c in CLASSES:
            a, b, s = (o[k].get(c, 0.0) for k in ("shares_uncorrected", "shares_corrected", "shares_source_train"))
            if max(a, b, s) >= 0.001:
                L.append(f"| {t} | {c} | {a:.3f} | {b:.3f} | {s:.3f} |")
    sb = out["overlap"]["a2i"]["source_bound"]
    L += ["", f"Post hoc, source side (a2i): shifting the source shares by Chicago's held-out v2 error, weighted by "
          f"f = {sb['chicago_fraction_upper']:.3f} (upper bound on Chicago's share of the pool), gives an overlap without "
          f"other of {sb['overlap_no_other']:.3f} [{sb['overlap_no_other_ci95'][0]:.3f}, {sb['overlap_no_other_ci95'][1]:.3f}]."]
    p = out["predictions"]
    L += ["", f"Q1 {'held' if p['Q1']['held'] else 'refuted'}: Seattle new-construction recall "
          f"{p['Q1']['seattle_new_recall']:.3f}; alteration precision Chicago {p['Q1']['alteration_precision'][0]:.3f}, "
          f"Seattle {p['Q1']['alteration_precision'][1]:.3f}.",
          f"Q2 {'held' if p['Q2']['held'] else 'refuted'}: a2i overlap without other {p['Q2']['uncorrected']:.3f} as run, "
          f"{p['Q2']['corrected']:.3f} corrected [{p['Q2']['ci95'][0]:.3f}, {p['Q2']['ci95'][1]:.3f}].", ""]
    return "\n".join(L)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--boot", type=int, default=2000)
    ap.add_argument("--seed", type=int, default=20261110)
    a = ap.parse_args()
    out = run(a.boot, a.seed)
    json.dump(out, open(os.path.join(RES, "desc_confusion.json"), "w"), indent=1)
    md = markdown(out)
    open(os.path.join(RES, "desc_confusion.md"), "w").write(md)
    print(md)
