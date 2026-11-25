#!/usr/bin/env python3
"""Draw labelled identifier cases for the cross-venture identifier oracle.

python-stdnum (https://github.com/arthurdejong/python-stdnum, LGPL-2.1+) is the
oracle. It is only called here, at test time, never vendored or imported by a
venture, so its licence does not reach the MIT code it checks.

Writes JSON lines to stdout: {"domain", "value", "valid", "kind", "cc"} where
`valid` is stdnum's verdict and `kind` says how the case was drawn (a valid
number, a one-character typo, an adjacent swap, a length change with the IBAN
check digits recomputed, an alias of the check digits, a random string).

    python3 -m pip install python-stdnum==2.2
    python3 platform/ci/id_oracle/gen_cases.py --seed 7 --per 400 > cases.jsonl
    node platform/ci/id_oracle/run.mjs cases.jsonl
"""

import argparse
import json
import os
import random
import re
import string
import sys

from stdnum import bic, ean, iban, isbn
from stdnum.eu import at_02
from stdnum.us import rtn

DIGITS = string.digits
UPPER = string.ascii_uppercase
ALNUM = DIGITS + UPPER


def registry():
    """Country -> BBAN structure, from stdnum's copy of the SWIFT IBAN registry."""
    path = os.path.join(os.path.dirname(iban.__file__), "iban.dat")
    out = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r'^([A-Z]{2}) .*bban="([^"]+)"', line)
            if m:
                out[m.group(1)] = m.group(2)
    return out


def draw_struct(struct, rnd):
    out = []
    for n, kind in re.findall(r"(\d+)!([nace])", struct):
        pool = {"n": DIGITS, "a": UPPER, "c": ALNUM, "e": " "}[kind]
        out.append("".join(rnd.choice(pool) for _ in range(int(n))))
    return "".join(out)


def mod97(s):
    r = 0
    for ch in s:
        r = int(str(r) + (ch if ch.isdigit() else str(ord(ch) - 55))) % 97
    return r


def with_check_digits(cc, bban):
    """Country code + ISO 7064 mod 97 check digits + BBAN: a synthetic test case, not anyone's account."""
    cd = 98 - mod97(bban + cc + "00")
    return f"{cc}{cd:02d}{bban}"


def typo(s, rnd, start=0, pool=None):
    i = rnd.randrange(start, len(s))
    p = pool or (DIGITS if s[i].isdigit() else UPPER)
    c = rnd.choice([x for x in p if x != s[i]])
    return s[:i] + c + s[i + 1:]


def swap(s, rnd, start=0):
    for _ in range(20):
        i = rnd.randrange(start, len(s) - 1)
        if s[i] != s[i + 1]:
            return s[:i] + s[i + 1] + s[i] + s[i + 2:]
    return None


def emit(domain, value, valid, kind, cc=None):
    if domain == "iban" and not value[2:4].isdigit():
        valid = False  # stdnum's mod 97 takes letters in the check-digit place; ISO 13616 check digits are digits
    sys.stdout.write(json.dumps({"domain": domain, "value": value, "valid": bool(valid), "kind": kind, "cc": cc}) + "\n")


def gen_iban(rnd, per):
    reg = registry()
    for cc, struct in sorted(reg.items()):
        for _ in range(per):
            bban = draw_struct(struct, rnd)
            good = with_check_digits(cc, bban)
            emit("iban", good, iban.is_valid(good, check_country=False), "valid", cc)
            t = typo(good, rnd, start=2)
            emit("iban", t, iban.is_valid(t, check_country=False), "typo", cc)
            s = swap(good, rnd, start=2)
            if s:
                emit("iban", s, iban.is_valid(s, check_country=False), "swap", cc)
            # one character dropped or added, check digits recomputed: only the length can catch it
            longer = with_check_digits(cc, bban + rnd.choice(DIGITS))
            emit("iban", longer, iban.is_valid(longer, check_country=False), "length+1", cc)
            shorter = with_check_digits(cc, bban[:-1])
            emit("iban", shorter, iban.is_valid(shorter, check_country=False), "length-1", cc)
        # check digits 97, 98 and 02 have aliases 00, 01 and 99 that also leave remainder 1
        for _ in range(per):
            bban = draw_struct(struct, rnd)
            good = with_check_digits(cc, bban)
            alias = {"97": "00", "98": "01", "02": "99"}.get(good[2:4])
            if alias:
                v = good[:2] + alias + good[4:]
                emit("iban", v, iban.is_valid(v, check_country=False), "cd-alias", cc)
    # country codes outside the registry, valid mod 97
    for cc in ("US", "CA", "AU", "XX", "ZZ"):
        v = with_check_digits(cc, "".join(rnd.choice(DIGITS) for _ in range(16)))
        emit("iban", v, iban.is_valid(v, check_country=False), "no-country", cc)


def gtin_check(body):
    s = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(body)))
    return str((10 - s % 10) % 10)


def gen_gtin(rnd, per):
    for n in (8, 12, 13, 14):
        for _ in range(per):
            body = "".join(rnd.choice(DIGITS) for _ in range(n - 1))
            good = body + gtin_check(body)
            emit("gtin", good, ean.is_valid(good), "valid", str(n))
            t = typo(good, rnd)
            emit("gtin", t, ean.is_valid(t), "typo", str(n))
            s = swap(good, rnd)
            if s:
                emit("gtin", s, ean.is_valid(s), "swap", str(n))
    for n in (6, 7, 9, 10, 11, 15):
        for _ in range(per // 4):
            body = "".join(rnd.choice(DIGITS) for _ in range(n - 1))
            v = body + gtin_check(body)
            emit("gtin", v, ean.is_valid(v), "bad-length", str(n))


def gen_isbn(rnd, per):
    for _ in range(per):
        body = rnd.choice(["978", "979"]) + "".join(rnd.choice(DIGITS) for _ in range(9))
        good = body + gtin_check(body)
        emit("isbn13", good, isbn.is_valid(good), "valid")
        emit("isbn13", typo(good, rnd, start=3), isbn.is_valid(typo(good, rnd, start=3)), "typo")
        other = rnd.choice(["977", "980", "123"]) + good[3:-1]
        other += gtin_check(other)
        emit("isbn13", other, isbn.is_valid(other), "prefix")
    for _ in range(per):
        body = "".join(rnd.choice(DIGITS) for _ in range(9))
        c = (11 - sum((10 - i) * int(d) for i, d in enumerate(body)) % 11) % 11
        good = body + ("X" if c == 10 else str(c))
        emit("isbn10", good, isbn.is_valid(good), "valid")
        t = typo(good, rnd, pool=DIGITS) if good[-1] != "X" else typo(good[:-1], rnd) + "X"
        emit("isbn10", t, isbn.is_valid(t), "typo")


def gen_rtn(rnd, per):
    for _ in range(per):
        v = "".join(rnd.choice(DIGITS) for _ in range(9))
        emit("rtn", v, rtn.is_valid(v), "random")
        body = v[:8]
        for d in DIGITS:
            if rtn.is_valid(body + d):
                emit("rtn", body + d, True, "valid")
                emit("rtn", typo(body + d, rnd), rtn.is_valid(typo(body + d, rnd)), "typo")
                break


def gen_bic(rnd, per):
    ccs = sorted(set(registry()) | {"US", "CA", "JP", "CN", "AU", "IN", "XK"})
    for _ in range(per):
        cc = rnd.choice(ccs)
        bank = "".join(rnd.choice(UPPER) for _ in range(4))
        loc = "".join(rnd.choice(ALNUM) for _ in range(2))
        branch = rnd.choice(["", "XXX", "".join(rnd.choice(ALNUM) for _ in range(3))])
        v = bank + cc + loc + branch
        emit("bic", v, bic.is_valid(v), "valid-shape", cc)
        bad_cc = rnd.choice(["XX", "QQ", "ZZ", "AA"])
        v2 = bank + bad_cc + loc + branch
        emit("bic", v2, bic.is_valid(v2), "bad-country", bad_cc)


def gen_creditor(rnd, per):
    reg = registry()
    sepa = [cc for cc in ("AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE "
                          "IS LI NO CH GB AD MC SM VA").split() if cc in reg]
    for _ in range(per):
        cc = rnd.choice(sepa)
        biz = rnd.choice(["ZZZ", "000", "".join(rnd.choice(ALNUM) for _ in range(3))])
        nat = "".join(rnd.choice(ALNUM) for _ in range(rnd.randrange(5, 25)))
        v = at_02.calc_check_digits(cc + "00" + biz + nat)
        good = cc + v + biz + nat
        emit("creditor", good, at_02.is_valid(good), "valid", cc)
        t = typo(good, rnd, start=7)
        emit("creditor", t, at_02.is_valid(t), "typo", cc)
        # the business code is outside the check: changing it must not make a valid id invalid
        b2 = good[:4] + "".join(rnd.choice(ALNUM) for _ in range(3)) + good[7:]
        emit("creditor", b2, at_02.is_valid(b2), "business-code", cc)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--per", type=int, default=200)
    a = ap.parse_args()
    rnd = random.Random(a.seed)
    gen_iban(rnd, a.per)
    gen_gtin(rnd, a.per * 5)
    gen_isbn(rnd, a.per * 5)
    gen_rtn(rnd, a.per * 5)
    gen_bic(rnd, a.per * 5)
    gen_creditor(rnd, a.per * 5)


if __name__ == "__main__":
    main()
