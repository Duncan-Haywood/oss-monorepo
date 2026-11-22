"""Dump every formula openpyxl reads from a workbook, as JSON {"Sheet!A1": "=..."}.

openpyxl expands shared formulas itself (openpyxl.formula.translate.Translator),
so it is an independent reading to compare with this tool's xlsx.mjs.
Usage: python eval/openpyxl_formulas.py BOOK.xlsx > out.json  (pip install openpyxl)
"""
import json
import sys

import openpyxl

wb = openpyxl.load_workbook(sys.argv[1], data_only=False)
out = {}
for ws in wb.worksheets:
    for row in ws.iter_rows():
        for c in row:
            v = c.value
            if isinstance(v, str) and v.startswith("="):
                out[f"{ws.title}!{c.coordinate}"] = v
            elif v is not None and type(v).__name__ == "ArrayFormula":
                out[f"{ws.title}!{c.coordinate}"] = v.text
json.dump(out, sys.stdout)
