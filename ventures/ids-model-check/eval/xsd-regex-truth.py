"""Ground truth for eval/xsd-regex.mjs: each stdin line is JSON {"p": pattern,
"probes": [strings]}; prints {"ok": bool, "err": str, "m": [bool...]} using
elementpath's translate_pattern exactly as IfcTester calls it (ifctester/facet.py:
back_references, lazy_quantifiers and anchors all False, then re.fullmatch)."""
import json, re, sys
from elementpath.regex import translate_pattern

for line in sys.stdin:
    case = json.loads(line)
    try:
        rx = re.compile(translate_pattern(case["p"], back_references=False, lazy_quantifiers=False, anchors=False))
        out = {"ok": True, "m": [rx.fullmatch(s) is not None for s in case["probes"]]}
    except Exception as e:  # RegexError, or re.error on a translation elementpath let through
        out = {"ok": False, "err": f"{type(e).__name__}: {e}"[:200]}
    print(json.dumps(out))
