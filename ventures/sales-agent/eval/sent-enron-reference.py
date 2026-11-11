#!/usr/bin/env python3
"""Independent reader for eval/sent-enron.mjs: recipients (To and Cc) and UTC day of every Enron message filed in a
"sent" folder, with Python's email package (email.utils.getaddresses, parsedate_to_datetime). Messages with no
recipient or no readable date are skipped, as the collector skips them. Standard library only."""
import email, email.utils, json, os, sys, datetime

root = sys.argv[1]
paths = sorted(os.path.join(d, f) for d, _, fs in os.walk(root) for f in fs if not f.endswith(".xz"))
for p in paths:
    with open(p, encoding="latin-1") as fh:
        m = email.message_from_file(fh)
    if "sent" not in (m.get("X-Folder") or "").lower():
        continue
    to = sorted({a.lower() for _, a in email.utils.getaddresses(m.get_all("To", []) + m.get_all("Cc", [])) if "@" in a})
    try:
        d = email.utils.parsedate_to_datetime(m.get("Date")).astimezone(datetime.timezone.utc).date().isoformat()
    except Exception:
        continue
    if to:
        print(json.dumps({"file": os.path.relpath(p, root), "to": to, "date": d}))
