"""Milestone 156: per-corner wire RC for SKY130 HD, derived from the PDK's own OpenRCX extraction rules.

The ORFS sky130hd platform has one setRC.tcl (per-unit-length R and C per layer), used at every library corner so far: milestones 143
(ss) and 144 (ff) changed only the liberty. The SKY130 PDK ships OpenRCX rule files at three process corners (min, nom, max), in
open_pdks sky130/librelane/rules.openrcx.sky130A.{min,nom,max}.calibre (Apache-2.0; not vendored here). This script scales each layer of
the ORFS setRC.tcl by the PDK's corner/nominal ratio:

  R ratio of a layer = the RESOVER resistance per um at its minimum width (every row of that block carries the same value);
  C ratio of a layer = sum over every capacitance row of the layer (blocks OVER, UNDER, DIAGUNDER, all neighbours and spacings) of
                       (coupling + fringe), at the corner, over the same sum at nom.

Vias keep their nominal resistance (the rule files carry no via table). RCX metal 1..6 are li1, met1..met5 (LayerCount 6).
Sanity check: the nom R of each layer is within 20% of ORFS's own value (it is the same process data).

Fetch (pinned; sha256 checked below):
  git clone --depth 1 --filter=blob:none --sparse https://github.com/RTimothyEdwards/open_pdks.git op
  (cd op && git fetch --depth 1 origin 0c1f82326278a0871f0a1fc4bdacf94c88e78e4d && git checkout FETCH_HEAD && git sparse-checkout set sky130/librelane)
Usage: python3 derive_rc.py <op>/sky130/librelane <orfs sky130hd platform dir> [corner=max] [out setRC.tcl]
       prints the ratio table; writes the scaled setRC.tcl when an output path is given.
"""
import hashlib
import re
import sys
from pathlib import Path

OPEN_PDKS_COMMIT = "0c1f82326278a0871f0a1fc4bdacf94c88e78e4d"
SHA256 = {
    "min": "b11177d33b33878c080a0c1db6c6dd022e89c64ebf21cc87e0ac4d9c68378a63",
    "nom": "0b0678968a3d8665ee1ac882df2b0eb31e3896ac05130b9de6bd67ef2027c757",
    "max": "008ce6e4867fa9a68b16dbc50df596967d503f6c29b317354689f61f4c249220",
}
LAYERS = ["li1", "met1", "met2", "met3", "met4", "met5"]


def parse(text):
    """{metal index: {"res": R per um at min width, "cap": sum of coupling + fringe over all capacitance rows}}."""
    out, block, kind = {}, None, None
    for line in text.splitlines():
        m = re.match(r"^Metal (\d+) (RESOVER|OVER|UNDER|DIAGUNDER) \d+$", line)
        if m:
            block, kind = int(m.group(1)), m.group(2)
            out.setdefault(block, {"res": None, "cap": 0.0})
            continue
        if line.startswith("END DIST"):
            block = None
            continue
        if block is None or line.startswith("DIST"):
            continue
        f = line.split()
        if len(f) != 4:
            continue
        if kind == "RESOVER":
            if out[block]["res"] is None:
                out[block]["res"] = float(f[3])
        else:
            out[block]["cap"] += float(f[1]) + float(f[2])
    return out


def load(rules_dir, corner):
    p = Path(rules_dir) / f"rules.openrcx.sky130A.{corner}.calibre"
    b = p.read_bytes()
    if hashlib.sha256(b).hexdigest() != SHA256[corner]:
        sys.exit(f"{p} is not the pinned {corner} rule file")
    return parse(b.decode())


def ratios(rules_dir, corner):
    c, n = load(rules_dir, corner), load(rules_dir, "nom")
    return {LAYERS[i - 1]: (c[i]["res"] / n[i]["res"], c[i]["cap"] / n[i]["cap"], n[i]["res"]) for i in range(1, 7)}


def scaled_setrc(orfs_setrc_text, rat):
    def sub(m):
        layer, cap, res = m.group(1), float(m.group(2)), float(m.group(3))
        rr, cr, _ = rat[layer]
        return f"set_layer_rc -layer {layer} -capacitance {cap * cr:.6E} -resistance {res * rr:.6E}"
    out, n = re.subn(r"^set_layer_rc -layer (\S+) -capacitance (\S+) -resistance (\S+)$", sub, orfs_setrc_text, flags=re.M)
    assert n == 6, n
    return out


def orfs_values(text):
    return {m.group(1): (float(m.group(2)), float(m.group(3)))
            for m in re.finditer(r"^set_layer_rc -layer (\S+) -capacitance (\S+) -resistance (\S+)$", text, flags=re.M)}


def main():
    rules, plat = sys.argv[1], Path(sys.argv[2])
    corner = sys.argv[3] if len(sys.argv) > 3 else "max"
    orfs = (plat / "setRC.tcl").read_text()
    rat = ratios(rules, corner)
    ov = orfs_values(orfs)
    print(f"open_pdks {OPEN_PDKS_COMMIT}, corner {corner} / nom")
    print("layer  R ratio  C ratio  RC ratio  RCX nom R  ORFS R  (nom/ORFS)")
    for L in LAYERS:
        rr, cr, nr = rat[L]
        print(f"{L:5s}  {rr:7.4f}  {cr:7.4f}  {rr * cr:8.4f}  {nr:.4e}  {ov[L][1]:.4e}  {nr / ov[L][1]:.3f}")
        assert 0.8 < nr / ov[L][1] < 1.2, L
    if len(sys.argv) > 4:
        Path(sys.argv[4]).write_text(f"# SKY130 HD wire RC at the {corner} RC corner: ORFS setRC.tcl scaled per layer by the open_pdks\n"
                                     f"# OpenRCX {corner}/nom ratios (commit {OPEN_PDKS_COMMIT}); experiments/rc_corner/derive_rc.py\n"
                                     + scaled_setrc(orfs, rat))


if __name__ == "__main__":
    main()
