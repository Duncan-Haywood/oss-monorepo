"""Reads TOML documents as JSON lines on stdin ({"src": ...}) and prints tomllib's reading of each, tagged."""
import json, sys, tomllib, datetime, math

def tag(v):
    if isinstance(v, bool): return v
    if isinstance(v, int): return {"$int": str(v)}
    if isinstance(v, float):
        if math.isnan(v): return {"$float": "nan"}
        if math.isinf(v): return {"$float": "inf" if v > 0 else "-inf"}
        return {"$float": repr(v)}
    if isinstance(v, str): return v
    if isinstance(v, list): return [tag(x) for x in v]
    if isinstance(v, dict): return {k: tag(x) for k, x in v.items()}
    if isinstance(v, datetime.datetime): return {"$toml": "offset-datetime" if v.tzinfo else "local-datetime"}
    if isinstance(v, datetime.date): return {"$toml": "local-date"}
    if isinstance(v, datetime.time): return {"$toml": "local-time"}
    raise TypeError(type(v))

for line in sys.stdin:
    src = json.loads(line)["src"]
    try:
        print(json.dumps({"ok": tag(tomllib.loads(src))}))
    except (tomllib.TOMLDecodeError, ValueError) as e:
        print(json.dumps({"error": str(e)}))
