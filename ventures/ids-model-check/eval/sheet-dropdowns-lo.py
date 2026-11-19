#!/usr/bin/env python3
"""LibreOffice's own reading of the downloaded workbook's dropdown lists.

Opens each workbook eval/sheet-dropdowns.mjs --write DIR wrote, runs Calc's
Tools > Detective > Mark Invalid Data on the IDS sheet (XSheetAuditing
.showInvalid), and counts the circles it draws: one per cell whose value is
not in its list, suggest-only columns included (the alert setting does not
change what Calc counts as invalid). Compares the count with
DIR/expected.json, and checks the Lists sheet stayed hidden.

  soffice --headless --accept="socket,host=localhost,port=2002;urp;" &
  python3 eval/sheet-dropdowns-lo.py DIR
"""
import json, os, sys, time
import uno
from com.sun.star.beans import PropertyValue

d = sys.argv[1]
expected = json.load(open(os.path.join(d, "expected.json")))
local = uno.getComponentContext()
resolver = local.ServiceManager.createInstanceWithContext("com.sun.star.bridge.UnoUrlResolver", local)
for _ in range(60):
    try:
        ctx = resolver.resolve("uno:socket,host=localhost,port=2002;urp;StarOffice.ComponentContext"); break
    except Exception:
        time.sleep(1)
desktop = ctx.ServiceManager.createInstanceWithContext("com.sun.star.frame.Desktop", ctx)
hidden = PropertyValue(); hidden.Name = "Hidden"; hidden.Value = True
same = differ = 0
lists_seen = 0
out = []
for name in sorted(expected):
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(os.path.join(d, name))), "_blank", 0, (hidden,))
    sh = doc.Sheets.getByName("IDS")
    if doc.Sheets.hasByName("Lists") and not doc.Sheets.getByName("Lists").IsVisible:
        lists_seen += 1
    sh.showInvalid()
    circles = sh.DrawPage.Count
    if circles == expected[name]: same += 1
    else:
        differ += 1; out.append(f"{name}: LibreOffice {circles}, expected {expected[name]}")
    doc.close(True)
print(f"{same + differ} workbooks: LibreOffice marks the expected number of invalid cells in {same}, differs in {differ}; hidden Lists sheet in {lists_seen}")
for x in out[:20]: print("  " + x)
