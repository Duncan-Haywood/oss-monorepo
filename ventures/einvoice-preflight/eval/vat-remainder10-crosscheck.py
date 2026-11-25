"""Compare vat.mjs verdicts (from vat-remainder10-crosscheck.mjs) with the Python CLI and python-stdnum.

    python3 eval/vat-remainder10-crosscheck.py out.json   # needs python-stdnum on the path
"""
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "src"))
from einvoice_preflight.vat import inspect_party_vat  # noqa: E402
from stdnum.eu import vat as stdnum_vat  # noqa: E402

js = json.load(open(sys.argv[1]))
off_py, off_stdnum, groups = [], [], {}
for number, js_ok in js.items():
    py_ok = not any(f["rule"] == "INV-023" for f in inspect_party_vat({"vat_id": number}, "seller"))
    std_ok = stdnum_vat.is_valid(number)
    if py_ok != js_ok:
        off_py.append(number)
    if std_ok != js_ok:
        off_stdnum.append(number)
    g = groups.setdefault(f"{number[:2]} {len(number) - 2} digits", [0, 0])
    g[0] += 1
    g[1] += js_ok
for name, (n, ok) in sorted(groups.items()):
    print(f"{name}: {n} numbers, {ok} accepted")
print(f"vat.mjs vs Python CLI: {len(off_py)} disagree {off_py[:10]}")
print(f"vat.mjs vs python-stdnum: {len(off_stdnum)} disagree {off_stdnum[:10]}")
sys.exit(1 if off_py or off_stdnum else 0)
