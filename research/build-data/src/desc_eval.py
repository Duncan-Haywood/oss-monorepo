"""How often do the description keyword rules agree with a person reading the text? (session 71)

Stdlib only. Two steps:

  python3 src/desc_eval.py sample --out DIR --year 2023 --n 200 --seed 20261110 --offset-step 3 --offset0 0
      Draws applications from one year in Chicago and Seattle whose permit_type and work_class both
      map to 'other' (the rows the description must rescue) and writes DIR/sample_<year>.json with
      the description text. DIR must be outside git: the text can name people and addresses.
  python3 src/desc_eval.py score --sample DIR/sample_2023.json --labels results/desc_labels_2023.txt ...
      Scores classmap.describe (rules v1 and v2) against the hand labels and writes
      results/desc_rules_eval.json, with every row's (label, v1, v2) codes so the numbers can be
      recomputed from git alone.

Labelling protocol (the person labels from the text only, without the rules' output): the class is
the kind of work the permit covers; a mixed job takes its principal or first-listed whole job;
administrative rows (contractor change, revision, reinstatement, withdrawal), elevators and lifts,
scaffolds, telecom equipment, grading and plain "monthly maintenance" are 'other'; solar, low
voltage, security and data cabling, service and panel work are electrical; fences, masonry, roofs,
windows, decks, retaining walls and seismic retrofits are alteration; a new garage, shed or
accessory dwelling built from scratch is new construction.
"""
import argparse, csv, io, json, math, os, random, sys, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import classmap  # noqa: E402

FEEDS = {"chicago": ("data.cityofchicago.org", "ydr8-5enu", "application_start_date", "permit_type",
                     "review_type", "work_description", "id"),
         "seattle": ("data.seattle.gov", "76t5-zqzr", "applieddate", "permittypemapped",
                     "permitclassmapped", "description", "permitnum")}
CODES = dict(A="alteration", N="new_construction", E="electrical", P="plumbing", M="mechanical",
             D="demolition", S="sign", F="fire", O="other")
INV = {v: k for k, v in CODES.items()}


def sample(out, year, n, seed, step, off0, pages=6):
    res = {}
    for city, (host, ds, dcol, pt, wc, desc, idc) in FEEDS.items():
        rows = []
        for k in range(pages):
            q = {"$select": f"{idc},{pt},{wc},{desc}",
                 "$where": f"{dcol} >= '{year}-01-01' AND {dcol} < '{year + 1}-01-01'",
                 "$limit": 1000, "$offset": off0 + k * 1000 * step}
            u = f"https://{host}/resource/{ds}.csv?" + urllib.parse.urlencode(q)
            rows += list(csv.DictReader(io.StringIO(urllib.request.urlopen(u, timeout=300).read().decode())))
        cand = [r for r in rows if classmap.harmonise(r[pt]) == "other"
                and (not r[wc] or classmap.harmonise(r[wc]) == "other")]
        random.Random(seed).shuffle(cand)
        res[city] = [dict(i=i, desc=(r[desc] or "").strip()) for i, r in enumerate(cand[:n])]
        print(city, len(rows), "fetched,", len(cand), "type-other,", len(res[city]), "sampled", file=sys.stderr)
    path = os.path.join(out, f"sample_{year}.json")
    json.dump(res, open(path, "w"), indent=0)
    return path


def read_labels(path):
    lab = {}
    for line in open(path):
        if line.strip() and not line.startswith("#"):
            city, *toks = line.split()
            lab[city] = {int(t[:-1]): CODES[t[-1]] for t in toks}
    return lab


def wilson(k, n, z=1.959964):
    if not n:
        return [None, None]
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return [c - h, c + h]


def mcnemar_exact(b, c):
    """Two-sided exact McNemar p-value: b rows only v1 right, c rows only v2 right."""
    n = b + c
    if not n:
        return 1.0
    tail = sum(math.comb(n, i) for i in range(0, min(b, c) + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def metrics(pairs):
    n = len(pairs)
    ok = sum(h == p for h, p in pairs)
    pred = sum(p != "other" for _, p in pairs)
    hum = sum(h != "other" for h, _ in pairs)
    hit = sum(h == p != "other" for h, p in pairs)
    return dict(n=n, accuracy=ok / n, accuracy_ci95=wilson(ok, n), rescued_share=pred / n,
                human_non_other_share=hum / n,
                precision_non_other=hit / pred if pred else None,
                recall_non_other=hit / hum if hum else None)


def kappa(pairs):
    """Cohen's kappa between labels and rules (chance agreement from the two marginals)."""
    n = len(pairs)
    po = sum(h == p for h, p in pairs) / n
    hs, ps = {}, {}
    for h, p in pairs:
        hs[h] = hs.get(h, 0) + 1
        ps[p] = ps.get(p, 0) + 1
    pe = sum(hs[c] * ps.get(c, 0) for c in hs) / n / n
    return (po - pe) / (1 - pe) if pe < 1 else None


def audit(res):
    """Per-class precision and recall, Cohen's kappa and the commonest confusions, recomputed from the
    committed (label, v1, v2) codes alone (session 72; no description text needed)."""
    out = {}
    for split in ("dev", "held_out"):
        for city, r in res[split]["cities"].items():
            for k in (1, 2):
                pairs = [(CODES[x[0]], CODES[x[k]]) for x in r["rows"]]
                per = {}
                for c in CODES.values():
                    tp = sum(h == p == c for h, p in pairs)
                    npred, nlab = sum(p == c for _, p in pairs), sum(h == c for h, _ in pairs)
                    if npred or nlab:
                        per[c] = dict(n_label=nlab, n_pred=npred,
                                      precision=tp / npred if npred else None, precision_ci95=wilson(tp, npred),
                                      recall=tp / nlab if nlab else None, recall_ci95=wilson(tp, nlab))
                conf = {}
                for h, p in pairs:
                    if h != p:
                        conf[f"{h}->{p}"] = conf.get(f"{h}->{p}", 0) + 1
                out.setdefault(split, {}).setdefault(city, {})[f"v{k}"] = dict(
                    n=len(pairs), accuracy=sum(h == p for h, p in pairs) / len(pairs), kappa=kappa(pairs),
                    per_class=per, confusions=dict(sorted(conf.items(), key=lambda kv: -kv[1])))
    return out


def audit_md(a):
    L = ["# Description rules: per-class audit (session 72)", "",
         "Recomputed by `python3 src/desc_eval.py audit` from the (label, v1, v2) codes in",
         "`desc_rules_eval.json`; one labeller (the agent). Precision and recall with 95% Wilson intervals;",
         "classes with fewer than 5 labelled or predicted rows are left out of the table.", ""]
    for split in ("held_out", "dev"):
        for city, vv in a[split].items():
            L += [f"## {split} {city}", "", "| rules | accuracy | kappa | top confusions (label->rules) |",
                  "|---|---|---|---|"]
            for k, r in vv.items():
                top = ", ".join(f"{c} {n}" for c, n in list(r["confusions"].items())[:4])
                L.append(f"| {k} | {r['accuracy']:.3f} | {r['kappa']:.3f} | {top} |")
            L += ["", "| class | n label | v2 precision [95%] | v2 recall [95%] | v1 precision | v1 recall |",
                  "|---|---|---|---|---|---|"]
            f = lambda x: "-" if x is None else f"{x:.2f}"
            fi = lambda x, ci: "-" if x is None else f"{x:.2f} [{ci[0]:.2f}, {ci[1]:.2f}]"
            for c, p2 in vv["v2"]["per_class"].items():
                p1 = vv["v1"]["per_class"].get(c, {})
                if max(p2["n_label"], p2["n_pred"]) < 5:
                    continue
                L.append(f"| {c} | {p2['n_label']} | {fi(p2['precision'], p2['precision_ci95'])} | "
                         f"{fi(p2['recall'], p2['recall_ci95'])} | {f(p1.get('precision'))} | {f(p1.get('recall'))} |")
            L.append("")
    return "\n".join(L)


def score(sample_path, labels_path, split):
    S, L = json.load(open(sample_path)), read_labels(labels_path)
    out = {}
    for city, rows in S.items():
        lab = L[city]
        assert sorted(lab) == list(range(len(rows))), f"{city}: labels do not cover the sample"
        v = {k: [classmap.describe(r["desc"], k) for r in rows] for k in (1, 2)}
        h = [lab[r["i"]] for r in rows]
        res = {f"v{k}": metrics(list(zip(h, v[k]))) for k in (1, 2)}
        b = sum(a == x != y for a, x, y in zip(h, v[1], v[2]))
        c = sum(a == y != x for a, x, y in zip(h, v[1], v[2]))
        res["v1_only_right"], res["v2_only_right"], res["mcnemar_p"] = b, c, mcnemar_exact(b, c)
        res["rows"] = ["".join(INV[x] for x in t) for t in zip(h, v[1], v[2])]  # label, v1, v2
        out[city] = res
    return dict(split=split, sample=os.path.basename(sample_path), labels=os.path.basename(labels_path),
                cities=out)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sp = ap.add_subparsers(dest="cmd", required=True)
    a1 = sp.add_parser("sample")
    a1.add_argument("--out", required=True)
    a1.add_argument("--year", type=int, required=True)
    a1.add_argument("--n", type=int, default=200)
    a1.add_argument("--seed", type=int, default=20261110)
    a1.add_argument("--offset-step", type=int, default=3)
    a1.add_argument("--offset0", type=int, default=0)
    sp.add_parser("audit")
    a2 = sp.add_parser("score")
    a2.add_argument("--dev-sample", required=True)
    a2.add_argument("--dev-labels", required=True)
    a2.add_argument("--held-sample", required=True)
    a2.add_argument("--held-labels", required=True)
    a = ap.parse_args()
    if a.cmd == "sample":
        print(sample(a.out, a.year, a.n, a.seed, a.offset_step, a.offset0))
    elif a.cmd == "audit":
        rd = os.path.join(HERE, "..", "results")
        au = audit(json.load(open(os.path.join(rd, "desc_rules_eval.json"))))
        json.dump(au, open(os.path.join(rd, "desc_rules_audit.json"), "w"), indent=1)
        md = audit_md(au)
        open(os.path.join(rd, "desc_rules_audit.md"), "w").write(md + "\n")
        print(md)
    else:
        res = dict(note="dev: 2023 sample the v2 rules were written against (v2 score optimistic); "
                        "held_out: 2022 sample labelled before v2 was run on it",
                   dev=score(a.dev_sample, a.dev_labels, "dev"),
                   held_out=score(a.held_sample, a.held_labels, "held_out"))
        p = os.path.join(HERE, "..", "results", "desc_rules_eval.json")
        json.dump(res, open(p, "w"), indent=1)
        for split in ("dev", "held_out"):
            for c, r in res[split]["cities"].items():
                print(split, c, "n", r["v1"]["n"], "v1 acc %.3f" % r["v1"]["accuracy"],
                      "v2 acc %.3f" % r["v2"]["accuracy"], "[%.3f, %.3f]" % tuple(r["v2"]["accuracy_ci95"]),
                      "mcnemar p %.2g" % r["mcnemar_p"])
