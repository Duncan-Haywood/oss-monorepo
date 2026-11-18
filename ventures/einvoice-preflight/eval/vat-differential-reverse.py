"""Reverse direction: random numbers vat.mjs accepts that python-stdnum rejects.
Emits cases {cc, number, valid}; run: python3 eval/vat-differential-reverse.py | node eval/vat-differential-reverse.mjs"""
import importlib, json, random, string
random.seed(20261111)
MODS = {"AT":"at","BE":"be","BG":"bg","CY":"cy","CZ":"cz","DE":"de","DK":"dk","EE":"ee","ES":"es","FI":"fi","FR":"fr","GB":"gb","HR":"hr","HU":"hu","IE":"ie","IT":"it","LT":"lt","LU":"lu","LV":"lv","MT":"mt","NL":"nl","PL":"pl","PT":"pt","RO":"ro","SE":"se","SI":"si","SK":"sk","RS":"rs","TR":"tr","CL":"cl","CO":"co","MK":"mk","ME":"me"}
out = []
for cc, mod in MODS.items():
    try:
        pkg = importlib.import_module(f"stdnum.{mod}"); v = (getattr(pkg, "vat", None) or pkg).is_valid
    except Exception: continue
    for _ in range(20000):
        pre = random.choice(["", "", "U", "P", "A"])
        L = random.choice([8, 9, 10, 11, 12])
        s = pre + "".join(random.choice(string.digits) for _ in range(L - len(pre)))
        out.append({"cc": cc, "number": s, "valid": bool(v(s))})
json.dump(out, __import__("sys").stdout)
