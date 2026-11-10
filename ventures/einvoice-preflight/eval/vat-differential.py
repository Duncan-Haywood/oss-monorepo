"""Differential test: random numbers python-stdnum accepts as VAT numbers vs vat.mjs.
Writes JSON cases {cc, number, valid} to stdout. Usage: python3 eval/vat-differential.py [per_country] | node eval/vat-differential.mjs
A case with valid=true that vat.mjs flags is a false reject (the costly kind)."""
import importlib, json, random, sys, string
n = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
random.seed(20261110)
MODS = {"AT":"at","BE":"be","BG":"bg","CY":"cy","CZ":"cz","DE":"de","DK":"dk","EE":"ee","EL":"gr","ES":"es","FI":"fi","FR":"fr","GB":"gb","HR":"hr","HU":"hu","IE":"ie","IT":"it","LT":"lt","LU":"lu","LV":"lv","MT":"mt","NL":"nl","PL":"pl","PT":"pt","RO":"ro","SE":"se","SI":"si","SK":"sk","CH":"ch","NO":"no","RS":"rs","TR":"tr","CL":"cl","CO":"co","MX":"mx","AR":"ar","BR":"br","PE":"pe","UY":"uy","ID":"id","IL":"il","KE":"ke","MK":"mk","ME":"me","RU":"ru","UA":"ua"}
cases = []
for cc, mod in MODS.items():
    try:
        pkg = importlib.import_module(f"stdnum.{mod}")
        m = getattr(pkg, "vat", None) or pkg
    except Exception:
        continue
    v = getattr(m, "is_valid", None)
    if not v: continue
    got = 0
    for pre in ["", "U", "P", "E", "S", "N", "I"]:
        for L in range(6, 14):
            for _ in range(2500):
                body = "".join(random.choice(string.digits) for _ in range(L - len(pre)))
                s = pre + body
                if random.random() < .12: s = s[:-1] + random.choice(string.ascii_uppercase)
                try: ok = v(s)
                except Exception: ok = False
                if ok and got < 400:
                    got += 1
                    cases.append({"cc": cc, "number": s, "valid": True})
json.dump(cases, sys.stdout)
