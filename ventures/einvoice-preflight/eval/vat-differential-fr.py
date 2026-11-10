"""French TVA differential (letter keys included): 40,000 random keys x SIRENs
(half with a Luhn-valid SIREN) against python-stdnum fr.tva. Emits cases
{number, valid}; run: python3 eval/vat-differential-fr.py | node eval/vat-differential-fr.mjs"""
import json, random, sys
from stdnum.fr import tva
random.seed(20261110)
A = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
def luhn_fix(s):
    for d in "0123456789":
        t = s + d
        tot = 0
        for i, c in enumerate(reversed(t)):
            n = int(c)
            if i % 2: n = n * 2 - 9 if n * 2 > 9 else n * 2
            tot += n
        if tot % 10 == 0: return t
out = []
for i in range(40000):
    s8 = "".join(random.choice("0123456789") for _ in range(8))
    siren = luhn_fix(s8) if i % 2 else s8 + random.choice("0123456789")
    if i % 20 == 0: siren = luhn_fix("000" + siren[3:8]) if False else "000" + siren[3:]
    key = random.choice(["%02d" % random.randrange(100), random.choice(A) + random.choice(A)])
    if key == "FR": continue  # stdnum strips a leading FR as the country prefix, so the key FR cannot be tested through it
    n = key + siren
    out.append({"number": n, "valid": bool(tva.is_valid(n))})
json.dump(out, sys.stdout)
