"""Runs validate-pyproject (with trove-classifiers and packaging) on each path given on stdin; prints JSON lines."""
import json, sys, tomllib
from validate_pyproject import api, errors
v = api.Validator()
for line in sys.stdin:
    path = line.strip()
    try:
        with open(path, "rb") as f:
            data = tomllib.load(f)
        v(data)
        print(json.dumps({"ok": True}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": (type(e).__name__ + ": " + str(e)).splitlines()[0][:300]}))
