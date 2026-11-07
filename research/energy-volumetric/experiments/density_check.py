"""Check the reactant densities of model.py against PubChem's Density records (HSDB / CRC
Handbook excerpts, NIOSH, GHS), and test how far the Wh/L ranking moves over the sourced range.

    python experiments/density_check.py fetch   # queries PubChem, writes density_sources.json
    python experiments/density_check.py         # offline: compares, writes density_check.txt

`fetch` needs https://pubchem.ncbi.nlm.nih.gov (PUG REST + PUG View). The JSON it writes is
committed, so the second command is deterministic and offline.
"""
import json, re, sys, urllib.parse, urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "src"))
from energy_volumetric import DENSITY, volumetric_row  # noqa: E402
from energy_density import COUPLES  # noqa: E402

# model key -> PubChem compound name. LiC6 and Li0.5CoO2 have no Density record there.
NAMES = {"Pb": "Lead", "PbO2": "Lead dioxide", "H2SO4": "Sulfuric acid", "H2O": "Water",
         "FePO4": "Iron(III) phosphate", "Li": "Lithium", "S": "Sulfur", "Zn": "Zinc",
         "Al": "Aluminum"}
JSON = HERE / "density_sources.json"
OUT = HERE / "density_check.txt"


def _get(url):
    with urllib.request.urlopen(url, timeout=40) as r:
        return r.read().decode()


def fetch():
    data = {}
    for key, name in NAMES.items():
        q = urllib.parse.quote(name)
        cid = _get(f"https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/{q}/cids/TXT").split()[0]
        doc = json.loads(_get(f"https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/{cid}/JSON?heading=Density"))
        strings = []

        def walk(o):
            if isinstance(o, dict):
                if "StringWithMarkup" in o:
                    strings.append(o["StringWithMarkup"][0]["String"])
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        walk(doc)
        data[key] = {"name": name, "cid": cid, "records": strings}
    JSON.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")


def parse_values(strings):
    """Leading numbers read as g/cm3 from records that say g/cu cm, g/cm3, g/mL or a bare
    specific gravity ('9.375 at 66 F', '2.70'). Anything with 'kg' or 'lb' or a range is skipped."""
    vals = []
    for s in strings:
        m = re.match(r"\s*(?:(?:Relative density|Specific gravity)[^:]*:\s*)?(\d+\.?\d*)\s*(?:@|at|g/|\(|$)", s)
        if m and not re.search(r"kg|lb|mg", s):
            v = float(m.group(1))
            sig = len(m.group(1).replace(".", "").lstrip("0"))
            if 0.3 < v < 25 and sig >= 3:  # one-figure GHS roundings ("0.5", "2.7") are skipped
                vals.append(v)
    return vals


def run():
    src = json.loads(JSON.read_text())
    lines = ["Reactant densities in model.py against PubChem Density records (g/cm3)", ""]
    lines.append(f"{'species':8s} {'model':>7s} {'sourced min':>12s} {'max':>7s} {'n':>3s}  verdict")
    rng = {}
    for k, rec in src.items():
        v = parse_values(rec["records"])
        if k == "H2SO4":  # the records mix acid strengths; the model uses the 100% acid
            v = [x for x in v if x >= 1.8]
        lo, hi = (min(v), max(v)) if v else (None, None)
        rng[k] = (lo, hi)
        m = DENSITY[k]
        verdict = "no parsable record" if not v else ("inside" if lo - 0.02 * lo <= m <= hi + 0.02 * hi else "OUTSIDE")
        lines.append(f"{k:8s} {m:7.3f} {lo if lo else float('nan'):12.3f} {hi if hi else float('nan'):7.3f} {len(v):3d}  {verdict}  (CID {rec['cid']})")
    lines.append("")
    lines.append("Not checkable here (no Density record): LiC6, Li0.5CoO2, liquid O2, liquid H2.")
    lines.append("")
    lines.append("Wh/L (O2 from air) at the model densities, and with every sourced density set to its")
    lines.append("low and to its high end (all species together, a worst-case bracket):")
    base = {c[0]: volumetric_row(c[0])["wh_l_air"] for c in COUPLES}
    saved = dict(DENSITY)
    out = {}
    for tag, idx in (("dense", 1), ("light", 0)):
        for k, (lo, hi) in rng.items():
            if lo:
                DENSITY[k] = (lo, hi)[idx]
        out[tag] = {c[0]: volumetric_row(c[0])["wh_l_air"] for c in COUPLES}
        DENSITY.update(saved)
    lines.append(f"{'couple':10s} {'model':>8s} {'light':>8s} {'dense':>8s}  swing")
    for k, b in base.items():
        a, d = out["light"][k], out["dense"][k]
        lines.append(f"{k:10s} {b:8.0f} {a:8.0f} {d:8.0f}  {100*(d-a)/b:5.1f}% of model")
    order = lambda t: sorted(base, key=lambda k: -t[k])
    lines.append("")
    for tag, t in (("model", base), ("light", out["light"]), ("dense", out["dense"])):
        lines.append(f"Ranking by Wh/L, {tag:5s}: " + " > ".join(order(t)))
    OUT.write_text("\n".join(lines) + "\n")
    print("\n".join(lines))


if __name__ == "__main__":
    fetch() if sys.argv[1:] == ["fetch"] else run()
