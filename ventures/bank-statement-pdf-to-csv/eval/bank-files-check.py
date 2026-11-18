"""Reads the files eval/bank-files.mjs wrote with two independent OFX readers
(ofxtools, ofxparse) and compares rows, net amount, ids and ledger balance with
what the converter read from the PDFs. Usage: python eval/bank-files-check.py <folder>"""
import json, sys, pathlib
from decimal import Decimal
from ofxtools.Parser import OFXTree
import ofxparse

folder = pathlib.Path(sys.argv[1])
truth = json.loads((folder / "truth.json").read_text())
bad = 0
for name, t in truth.items():
    for ext in ("ofx", "qfx", "qbo"):
        p = folder / f"{name}.{ext}"
        tree = OFXTree(); tree.parse(str(p)); ofx = tree.convert()
        st = ofx.statements[0]
        txs = list(st.banktranlist)
        net = sum(Decimal(x.trnamt) for x in txs)
        ids = {x.fitid for x in txs}
        bal = getattr(st, "ledgerbal", None)
        got_bal = int(bal.balamt * 100) if bal is not None else None
        with open(p, "rb") as fh: o2 = ofxparse.OfxParser.parse(fh)
        t2 = o2.account.statement.transactions
        net2 = sum(Decimal(x.amount) for x in t2)
        ok = (len(txs) == t["rows"] == len(t2) and int(net * 100) == t["sumCents"] == int(net2 * 100)
              and len(ids) == len(txs) and got_bal == t["ledger"])
        bad += not ok
        print(f"{name}.{ext}: ofxtools {len(txs)} rows net {net} ids unique {len(ids) == len(txs)} ledger {got_bal}; ofxparse {len(t2)} rows net {net2}; expected {t['rows']} rows net {Decimal(t['sumCents']) / 100} ledger {t['ledger']} -> {'OK' if ok else 'MISMATCH'}")
print(f"{bad} mismatches")
sys.exit(1 if bad else 0)
