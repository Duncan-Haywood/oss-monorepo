"""Draws IBANs for every country in python-stdnum's IBAN registry and prints JSON cases for eval/iban-differential.mjs.

  valid=True : stdnum.iban.validate accepts it (structure per registry, mod-97, country check digits).
  valid=False: right length and correct mod-97 but stdnum rejects it (wrong BBAN character classes, or a
               national check digit that fails). These test false accepts.
Needs python-stdnum (2.2 used). stdnum is an oracle; no SWIFT or bank text was read.
"""
import json, random, re, string, sys
from stdnum import iban, numdb
from stdnum.exceptions import ValidationError
from stdnum.iso7064 import mod_97_10

random.seed(int(sys.argv[1]) if len(sys.argv) > 1 else 7)
N = int(sys.argv[2]) if len(sys.argv) > 2 else 300
db = numdb.get("iban")
ALNUM = string.ascii_uppercase + string.digits
CLS = {"n": string.digits, "a": string.ascii_uppercase, "c": ALNUM}

def with_check(cc, bban):
    check = "%02d" % (98 - int(mod_97_10.calc_check_digits(bban + cc, 2) if False else 0))
    # compute via the standard: move CC00 to the end, mod 97
    s = bban + cc + "00"
    n = int("".join(str(int(ch, 36)) for ch in s))
    return cc + "%02d" % (98 - n % 97) + bban

def structured(bban_fmt):
    out = ""
    for count, cls in re.findall(r"(\d+)!([nac])", bban_fmt):
        out += "".join(random.choice(CLS[cls]) for _ in range(int(count)))
    return out

def ok(num):
    try:
        iban.validate(num); return True
    except ValidationError:
        return False

cases = []
for line in open(db.__dict__.get("_filename", "") or "/dev/null") if False else []:
    pass
import stdnum, os
rows = []
for line in open(os.path.join(os.path.dirname(stdnum.__file__), "iban.dat")):
    m = re.match(r'(\w\w) country="[^"]*" bban="([^"]+)"', line)
    if m: rows.append(m.groups())
for cc, fmt in rows:
    length = 4 + sum(int(c) for c, _ in re.findall(r"(\d+)!([nac])", fmt))
    for _ in range(N):
        num = with_check(cc, structured(fmt))
        cases.append({"cc": cc, "number": num, "valid": ok(num), "kind": "structured"})
    for _ in range(N):
        bban = "".join(random.choice(ALNUM) for _ in range(length - 4))
        num = with_check(cc, bban)
        cases.append({"cc": cc, "number": num, "valid": ok(num), "kind": "random"})
print(json.dumps(cases))
