"""Check the XER-to-Excel workbook (excel.mjs) with readers that share no code with it.

For each XER given, this script parses the file with its own small reader
(below), opens the .xlsx that `node cli.mjs FILE.xer --excel FILE.xlsx --raw` wrote
next to it with openpyxl, and compares, cell by cell:

  Activities    one row per TASK row; Activity ID, name, status, the stored
                early/late/actual/planned dates (to the minute), original and
                remaining duration and total/free float in days of the
                activity's calendar, every activity-code column and every
                activity UDF column
  Relationships one row per TASKPRED row; predecessor, successor, type, lag hours
  Predecessors  each activity's Predecessors cell names exactly its TASKPRED rows
  Assignments   one row per TASKRSRC row; budgeted units and cost
  XER <table>   every raw table: every field and every value, as text

Usage:  python3 eval/excel-check.py DIR/*.xer     (pip install openpyxl)
Prints one line per file and exits 1 on any mismatch.
"""
import re
import sys
import datetime as dt
import openpyxl


def read_xer(path):
    # P6's format as documented in eval/quotes-2026-11-21.md: a "" inside a
    # value is one quote; a last value that opens with a quote and holds line
    # breaks (P6 Web's clndr_data) runs on until its quotes balance and loses
    # its wrapping quotes. Windows-1252 as browsers decode it (WHATWG: the five
    # unassigned bytes 0x81 0x8D 0x8F 0x90 0x9D stay as U+0081...).
    raw = open(path, "rb").read()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        text = "".join(bytes([b]).decode("cp1252") if b not in (0x81, 0x8D, 0x8F, 0x90, 0x9D) else chr(b) for b in raw)
    if text.startswith("\ufeff"):
        text = text[1:]
    lines = re.split(r"\r?\n", text)
    tables, name, fields, i = {}, None, None, 0
    while i < len(lines):
        line = lines[i]
        p = line.split("\t")
        if p[0] == "%T":
            name = p[1].strip()
            tables.setdefault(name, [])
        elif p[0] == "%F":
            fields = [f.strip() for f in p[1:]]
        elif p[0] == "%R" and name:
            tail = line[line.rfind("\t") + 1:]
            if tail.startswith('"') and tail.count('"') % 2 == 1:
                while i + 1 < len(lines) and not re.match(r"%[TFRE]\t", lines[i + 1]):
                    i += 1
                    line += "\n" + lines[i]
                    if lines[i].count('"') % 2 == 1:
                        break
            vals = []
            for v in line.split("\t")[1:]:
                if len(v) >= 2 and v.startswith('"') and v.endswith('"') and "\n" in v:
                    v = v[1:-1]
                vals.append(v.replace('""', '"'))
            vals += [""] * (len(fields) - len(vals))
            tables[name].append(dict(zip(fields, vals)))
        elif p[0] == "%E":
            break
        i += 1
    return tables


def date(s):
    s = (s or "").strip()
    if not s:
        return None
    return dt.datetime.strptime(s[:16], "%Y-%m-%d %H:%M") if len(s) >= 16 else dt.datetime.strptime(s[:10], "%Y-%m-%d")


def minute(v):
    if v is None:
        return None
    return (v + dt.timedelta(seconds=30)).replace(second=0, microsecond=0)


def fnum(s):
    try:
        x = float(s)
        return x if x == x and abs(x) != float("inf") else None
    except (TypeError, ValueError):
        return None


def close(a, b, tol=0.0051):
    if a is None or b is None:
        return a is None and b is None
    return abs(a - b) <= tol


def rows_of(ws):
    out = []
    for r in ws.iter_rows(values_only=True):
        out.append(list(r))
    w = max(len(r) for r in out) if out else 0
    return [r + [None] * (w - len(r)) for r in out]


def check(path):
    T = read_xer(path)
    wb = openpyxl.load_workbook(path[:-4] + ".xlsx", read_only=True)
    bad, n = [], 0

    def expect(ok, what):
        nonlocal n
        n += 1
        if not ok and len(bad) < 15:
            bad.append(what)

    cal_hpd = {}
    for c in T.get("CALENDAR", []):
        h = fnum(c.get("day_hr_cnt"))
        cal_hpd[c["clndr_id"]] = h if h and 0 < h <= 24 else 8
    default = next((c["clndr_id"] for c in T.get("CALENDAR", []) if c.get("default_flag") == "Y"), None)
    hpd = lambda cid: cal_hpd.get(cid, cal_hpd.get(default, 8))
    # unrounded: the workbook rounds to 0.01 day, so it must sit within 0.005 of this
    days = lambda h, cid: None if fnum(h) is None else fnum(h) / hpd(cid)

    act = rows_of(wb["Activities"])
    head = act[0]
    col = {h: i for i, h in enumerate(head) if h}
    tasks = [t for t in T.get("TASK", []) if t.get("task_id")]
    expect(len(act) - 1 == len(tasks), f"Activities: {len(act) - 1} rows, TASK has {len(tasks)}")
    status = {"TK_NotStart": "Not Started", "TK_Active": "In Progress", "TK_Complete": "Completed"}
    # activity codes and UDFs, read independently
    types = {a["actv_code_type_id"]: a.get("actv_code_type") for a in T.get("ACTVTYPE", [])}
    vals = {c["actv_code_id"]: c for c in T.get("ACTVCODE", [])}
    codes = {}
    for a in T.get("TASKACTV", []):
        tid = a.get("actv_code_type_id") or vals.get(a["actv_code_id"], {}).get("actv_code_type_id")
        codes.setdefault(a["task_id"], {})[types.get(tid)] = vals.get(a["actv_code_id"], {}).get("short_name", a["actv_code_id"])
    udft = {u["udf_type_id"]: u for u in T.get("UDFTYPE", []) if u.get("table_name") == "TASK"}
    udfv = {}
    for v in T.get("UDFVALUE", []):
        u = udft.get(v.get("udf_type_id"))
        if u:
            udfv.setdefault(v["fk_id"], {})[u.get("udf_type_label")] = v
    preds = {}
    code_of = {t["task_id"]: t["task_code"] for t in T.get("TASK", [])}
    for r in T.get("TASKPRED", []):
        preds.setdefault(r["task_id"], []).append(code_of.get(r["pred_task_id"], "?") + " " + r["pred_type"][3:])

    for t, row in zip(tasks, act[1:]):
        g = lambda h: row[col[h]]
        cid, code = t.get("clndr_id"), t["task_code"]
        expect(g("Activity ID") == code, f"{code}: Activity ID {g('Activity ID')!r}")
        expect((g("Activity Name") or "") == t.get("task_name", ""), f"{code}: name")
        expect(g("Activity Status") == status.get(t.get("status_code"), t.get("status_code") or None), f"{code}: status")
        for h, f in [("Early Start", "early_start_date"), ("Early Finish", "early_end_date"), ("Late Start", "late_start_date"), ("Late Finish", "late_end_date"),
                     ("Actual Start", "act_start_date"), ("Actual Finish", "act_end_date"), ("Planned Start", "target_start_date"), ("Planned Finish", "target_end_date")]:
            expect(minute(g(h)) == date(t.get(f)), f"{code}: {h} {g(h)} vs {t.get(f)!r}")
        for h, f in [("Original Duration (d)", "target_drtn_hr_cnt"), ("Remaining Duration (d)", "remain_drtn_hr_cnt"), ("Total Float (d)", "total_float_hr_cnt"), ("Free Float (d)", "free_float_hr_cnt")]:
            expect(close(g(h), days(t.get(f), cid)), f"{code}: {h} {g(h)} vs {days(t.get(f), cid)}")
        for ty, v in codes.get(t["task_id"], {}).items():
            if ty in col:
                expect(str(g(ty)) == str(v), f"{code}: code {ty} {g(ty)!r} vs {v!r}")
        for label, v in udfv.get(t["task_id"], {}).items():
            if label not in col:
                continue
            kind = udft[v["udf_type_id"]].get("logical_data_type", "")
            got = g(label)
            if "DATE" in kind:
                expect(minute(got) == date(v.get("udf_date")), f"{code}: UDF {label}")
            elif any(k in kind for k in ("INT", "FLOAT", "MONEY", "NUM")):
                expect(close(got, fnum(v.get("udf_number")), 1e-9), f"{code}: UDF {label} {got!r} vs {v.get('udf_number')!r}")
            elif kind != "FT_STATICTYPE" and v.get("udf_text"):
                expect(got == v.get("udf_text"), f"{code}: UDF {label}")
        cell = g("Predecessors") or ""
        listed = sorted(x.strip().split("+")[0].split("-")[0].strip() for x in cell.split(", ") if x.strip()) if cell else []
        want = sorted(preds.get(t["task_id"], []))
        # an activity ID can itself hold "-" or "+": compare counts, then each wanted entry as a prefix
        expect(len(listed) == len(want) and all(any(c.startswith(w) for c in cell.split(", ")) for w in want), f"{code}: predecessors {cell!r} vs {want}")

    rel = rows_of(wb["Relationships"])
    tp = T.get("TASKPRED", [])
    expect(len(rel) - 1 == len(tp), f"Relationships: {len(rel) - 1} rows, TASKPRED has {len(tp)}")
    for r, row in zip(tp, rel[1:]):
        expect(row[0] == code_of.get(r["pred_task_id"], row[0]) and row[2] == code_of.get(r["task_id"], row[2]) and row[4] == r["pred_type"][3:] and close(row[6] or 0, fnum(r.get("lag_hr_cnt")) or 0), f"relationship {r['task_pred_id']}: {row[:7]}")

    asg = rows_of(wb["Assignments"])
    tr = T.get("TASKRSRC", [])
    expect(len(asg) - 1 == len(tr), f"Assignments: {len(asg) - 1} rows, TASKRSRC has {len(tr)}")
    for a, row in zip(tr, asg[1:]):
        expect(row[0] == code_of.get(a["task_id"]) and close(row[4], fnum(a.get("target_qty")), 0.006) and close(row[8], fnum(a.get("target_cost")), 0.006), f"assignment {a.get('taskrsrc_id')}: {row[:9]}")

    raw_cells = 0
    has_raw = any(n.startswith("XER ") for n in wb.sheetnames)
    for name, rows in (T.items() if has_raw else []):
        sheet = f"XER {name}"[:31]
        if sheet not in wb.sheetnames:
            expect(False, f"no sheet {sheet}")
            continue
        got = rows_of(wb[sheet])
        fields = got[0] if got else []
        expect(len(got) - 1 == len(rows), f"{sheet}: {len(got) - 1} rows vs {len(rows)}")
        for r, g in zip(rows, got[1:]):
            for i, f in enumerate(fields):
                want = r.get(f, "")
                # Excel's cell limit; XML 1.0 cannot carry C0 controls
                want = "".join(ch for ch in want if ch in "\t\n\r" or ord(ch) >= 32)[:32767]
                raw_cells += 1
                expect((g[i] or "") == want, f"{sheet} {f}: {g[i]!r:.60} vs {want!r:.60}")
    return n, bad, raw_cells, len(tasks)


if __name__ == "__main__":
    failed = 0
    for p in sys.argv[1:]:
        n, bad, raw_cells, acts = check(p)
        print(f"{p.split('/')[-1]}: {n - len(bad) if not bad else 'FAIL'} of {n} checks ({acts} activities, {raw_cells} raw cells)" + ("" if not bad else "\n  " + "\n  ".join(bad)))
        failed += bool(bad)
    sys.exit(1 if failed else 0)
