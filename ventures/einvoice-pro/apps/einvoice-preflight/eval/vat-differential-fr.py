"""French TVA differential: random FR numbers with digit and letter keys, siren Luhn-valid half the time.
Emits cases {cc, number, valid}; run: python3 eval/vat-differential-fr.py | node eval/vat-differential-fr.mjs"""
import json, random, sys
from stdnum.fr import tva
random.seed(20261112)
AL = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
def luhn_siren():
    d = [random.randint(0, 9) for _ in range(8)]
    for c in range(10):
        s = d + [c]
        t = sum((x * 2 - 9 if x * 2 > 9 else x * 2) if i % 2 == 1 else x for i, x in enumerate(reversed(s)))
        if t % 10 == 0: return "".join(map(str, s))
out = []
for _ in range(40000):
    siren = luhn_siren() if random.random() < .5 else "".join(random.choice("0123456789") for _ in range(9))
    if random.random() < .05: siren = "000" + siren[3:]
    mode = random.random()
    if mode < .4: key = "".join(random.choice(AL) for _ in range(2))
    elif mode < .6: key = "%02d" % ((int(siren + "12")) % 97)
    else: key = "".join(random.choice("0123456789IO") if random.random() < .9 else random.choice("ABCDE") for _ in range(2))
    if key == "FR": continue  # stdnum compact() strips a leading FR twice; not a real disagreement
    n = key + siren
    out.append({"cc": "FR", "number": n, "valid": bool(tva.is_valid(n))})
json.dump(out, sys.stdout)
