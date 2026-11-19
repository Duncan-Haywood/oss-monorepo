"""Retypes every cell of each .xlsx in a folder in LibreOffice Calc, as a
person editing the downloaded sheet would, and saves the workbook as .xlsx
again into <out>. Each cell goes through .uno:EnterString, the dispatch the
input line uses, so Calc's input reading runs as on a keyboard: 42.0 becomes
42 and true a boolean unless the cell is formatted as Text. (XCell.setFormula
is not used: it converts even in a Text cell, which no keyboard does.)

  soffice --headless --accept='socket,host=localhost,port=2002;urp;' &
  python3 eval/sheet-retype.py <in dir> <out dir>
Used by eval/sheet-retype.mjs; results in eval/excel-workbooks-2026-11-19.md.
"""
import os, sys, time
import uno
from com.sun.star.beans import PropertyValue

def prop(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p

src, dst = sys.argv[1], sys.argv[2]
ctx = uno.getComponentContext()
resolver = ctx.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", ctx)
for _ in range(60):
    try:
        rctx = resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext"); break
    except Exception:
        time.sleep(1)
desktop = rctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", rctx)
dispatch = rctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.DispatchHelper", rctx)
for f in sorted(os.listdir(src)):
    if not f.endswith(".xlsx"): continue
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(os.path.join(src, f))), "_blank", 0, (prop("Hidden", True),))
    sheet = doc.Sheets.getByIndex(0)
    frame = doc.CurrentController.Frame
    cur = sheet.createCursor(); cur.gotoEndOfUsedArea(False)
    end = cur.RangeAddress
    for r in range(end.EndRow + 1):
        for c in range(end.EndColumn + 1):
            cell = sheet.getCellByPosition(c, r)
            s = cell.getString()
            if s != "":
                dispatch.executeDispatch(frame, ".uno:GoToCell", "", 0, (prop("ToPoint", cell.AbsoluteName),))
                dispatch.executeDispatch(frame, ".uno:EnterString", "", 0, (prop("StringName", s),))
    doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(os.path.join(dst, f))), (prop("FilterName", "Calc Office Open XML"),))
    doc.close(True)
