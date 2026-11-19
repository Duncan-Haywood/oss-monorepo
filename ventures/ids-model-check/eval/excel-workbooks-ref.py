"""Reference reading for eval/excel-workbooks.mjs: each workbook's sheet (the
one named IDS, else the first worksheet) through openpyxl 3.1, cells as the
text Excel shows: dates by the cell's number format (openpyxl's is_datetime),
rounded to the second; booleans true/false; numbers as numbers; strings as
openpyxl reads them. Also records docProps/app.xml's Application (who saved it).

  python3 eval/excel-workbooks-ref.py <dir> <ours.jsonl> <ref.jsonl>
"""
import re, zipfile
import json, sys, warnings, datetime, signal
warnings.filterwarnings("ignore")
import openpyxl
from openpyxl.styles.numbers import is_datetime
d = sys.argv[1]
out = open(sys.argv[3], "w")
def iso(v, kind):
    if isinstance(v, datetime.time): return v.replace(microsecond=0).isoformat() if v.microsecond < 500000 else (datetime.datetime.combine(datetime.date(2000,1,1), v) + datetime.timedelta(microseconds=1000000 - v.microsecond)).time().isoformat()
    if isinstance(v, datetime.datetime):
        v = (v + datetime.timedelta(microseconds=500000)).replace(microsecond=0)
        if kind == "date": return v.date().isoformat()
        if kind == "time": return v.time().isoformat()
        return v.isoformat()
    if isinstance(v, datetime.date): return v.isoformat()
    return None
for line in open(sys.argv[2]):
    o = json.loads(line)
    if "error" in o: continue
    f = o["f"]
    signal.alarm(60)
    try:
        wb = openpyxl.load_workbook(d + "/" + f, data_only=True)
        wss = [ws for ws in wb.worksheets]
        pick = next((ws for ws in wss if ws.title.strip().lower() == "ids"), wss[0])
        rows = []
        for r in pick.iter_rows(min_row=1, max_row=min(pick.max_row, 500), max_col=40):
            row = []
            for c in r:
                v = c.value
                if v is None: row.append(None); continue
                kind = is_datetime(c.number_format)
                s = iso(v, kind)
                if s is not None: row.append(["date", s]); continue
                if isinstance(v, bool): row.append(["bool", "true" if v else "false"]); continue
                if isinstance(v, (int, float)): row.append(["num", v]); continue
                row.append(["str", str(v)[:2000]])  # as the reader side caps it
            rows.append(row)
        try:
            app = re.search(r"<Application>([^<]*)", zipfile.ZipFile(d + "/" + f).read("docProps/app.xml").decode("utf-8", "replace")).group(1)
        except Exception:
            app = None
        out.write(json.dumps({"f": f, "sheet": pick.title, "app": app, "rows": rows}) + "\n")
    except Exception as e:
        out.write(json.dumps({"f": f, "error": repr(e)[:200]}) + "\n")
    signal.alarm(0)
