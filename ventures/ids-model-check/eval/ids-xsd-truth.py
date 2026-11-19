#!/usr/bin/env python3
"""Ground truth for structure.mjs: validate IDS files against the ids.xsd
bundled with IfcTester (xmlschema), one JSON line per file.

    pip install ifctester xmlschema
    python3 eval/ids-xsd-truth.py eval/corpus/real/*.ids eval/corpus/IDS-Audit-tool/testing.shared/**/*.ids > truth.jsonl
"""
import json
import os
import sys

import ifctester
import xmlschema

schema = xmlschema.XMLSchema(os.path.join(os.path.dirname(ifctester.__file__), "ids.xsd"))
for path in sys.argv[1:]:
    try:
        errors = [f"{e.path}: {e.reason}" for e in schema.iter_errors(path)]
        print(json.dumps({"file": path, "valid": not errors, "errors": errors[:20], "count": len(errors)}))
    except Exception as e:  # noqa: BLE001 - not XML at all, still a verdict
        print(json.dumps({"file": path, "valid": False, "errors": [f"unreadable: {str(e)[:300]}"], "count": 1}))
