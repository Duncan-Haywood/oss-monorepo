"""Offline VAT identifier shape and checksum observations.

This is a typo catch, not a VIES lookup and not a determination that a party
is registered, in scope, or entitled to charge tax. Identifiers that do not
match a complete published national shape are treated as internal ERP codes
and are left alone.
"""

from __future__ import annotations

from typing import Any


# Countries we will checksum. Others with a 2-letter prefix are format-only
# when the body matches the published length, so a bookkeeper still gets a
# length observation without a false "valid" claim.
_FORMAT_ONLY = {
    "BG": (9, 10),
    "CY": (9,),
    "CZ": (8, 9, 10),
    "EE": (9,),
    "EL": (9,),
    "GR": (9,),
    "HR": (11,),
    "HU": (8,),
    "LT": (9, 12),
    "LV": (11,),
    "MT": (8,),
    "RO": range(2, 11),
    "SI": (8,),
    "SK": (10,),
    "XI": (9, 12),
}


def normalize_vat(value: Any) -> str | None:
    """Uppercase and strip separators. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = "".join(ch for ch in value.upper() if ch.isalnum())
    return compact or None


def looks_like_complete_vat(value: Any) -> bool:
    """True when the value matches a known country prefix and body length."""
    compact = normalize_vat(value)
    if compact is None or len(compact) < 4:
        return False
    country, body = compact[:2], compact[2:]
    if not country.isalpha():
        return False
    return _classify(country, body) in {"checksum", "format"}


def inspect_party_vat(party: dict[str, Any], party_name: str) -> list[dict[str, str]]:
    """Return INV-022 / INV-023 observations for one supplier or customer."""
    findings: list[dict[str, str]] = []
    vat_id = party.get("vat_id")
    checked: set[str] = set()
    if vat_id not in (None, ""):
        findings.extend(_check_explicit(vat_id, f"/{party_name}/vat_id", party_name))
        compact = normalize_vat(vat_id)
        if compact:
            checked.add(compact)
    identifier = party.get("id")
    compact_id = normalize_vat(identifier)
    if compact_id and compact_id not in checked and looks_like_complete_vat(identifier):
        findings.extend(_check_complete(identifier, f"/{party_name}/id", party_name))
    return findings


def _check_explicit(value: Any, path: str, party_name: str) -> list[dict[str, str]]:
    if not isinstance(value, str) or not value.strip():
        return [_finding(
            "INV-022",
            f"{party_name.title()} VAT identifier is empty or not text.",
            "Provide the VAT identifier as text, or omit vat_id.",
            path,
        )]
    compact = normalize_vat(value)
    if compact is None or len(compact) < 4 or not compact[:2].isalpha():
        return [_finding(
            "INV-022",
            f"{party_name.title()} VAT identifier is not a country-prefixed VAT number.",
            "Use a two-letter country prefix plus the national number, for example DE and nine digits.",
            path,
        )]
    return _evaluate(compact[:2], compact[2:], path, party_name, require_known=True)


def _check_complete(value: Any, path: str, party_name: str) -> list[dict[str, str]]:
    compact = normalize_vat(value)
    if compact is None:
        return []
    return _evaluate(compact[:2], compact[2:], path, party_name, require_known=False)


def _evaluate(country: str, body: str, path: str, party_name: str, require_known: bool) -> list[dict[str, str]]:
    kind = _classify(country, body)
    if kind == "unknown":
        if require_known:
            return [_finding(
                "INV-022",
                f"{party_name.title()} VAT identifier uses an unrecognized country prefix.",
                "Use an EU, UK, or other published VAT country prefix, or omit vat_id for an internal id.",
                path,
            )]
        return []
    if kind == "bad-format":
        return [_finding(
            "INV-022",
            f"{party_name.title()} VAT identifier does not match the published {country} shape.",
            f"Correct the {country} VAT identifier length and characters, or use an internal id without a country prefix.",
            path,
        )]
    if kind == "checksum" and not _checksum_ok(country, body):
        return [_finding(
            "INV-023",
            f"{party_name.title()} VAT identifier fails the published {country} checksum.",
            f"Correct the {country} VAT identifier digits. This is a checksum typo check, not a registration lookup.",
            path,
        )]
    return []


def _classify(country: str, body: str) -> str:
    if country == "DE":
        return "checksum" if body.isdigit() and len(body) == 9 else "bad-format"
    if country == "FR":
        return "checksum" if len(body) == 11 and body[2:].isdigit() else "bad-format"
    if country == "BE":
        digits = body[1:] if body[:1] == "0" and len(body) == 11 else body
        return "checksum" if digits.isdigit() and len(digits) in (9, 10) else "bad-format"
    if country == "NL":
        return "checksum" if len(body) == 12 and body[9] == "B" and body[:9].isdigit() and body[10:].isdigit() else "bad-format"
    if country == "AT":
        return "checksum" if body.startswith("U") and len(body) == 9 and body[1:].isdigit() else "bad-format"
    if country == "IT":
        return "checksum" if body.isdigit() and len(body) == 11 else "bad-format"
    if country == "ES":
        return "checksum" if _es_shape(body) else "bad-format"
    if country == "PL":
        return "checksum" if body.isdigit() and len(body) == 10 else "bad-format"
    if country == "SE":
        return "checksum" if body.isdigit() and len(body) in (10, 12) else "bad-format"
    if country == "DK":
        return "checksum" if body.isdigit() and len(body) == 8 else "bad-format"
    if country == "FI":
        return "checksum" if body.isdigit() and len(body) == 8 else "bad-format"
    if country == "PT":
        return "checksum" if body.isdigit() and len(body) == 9 else "bad-format"
    if country == "LU":
        return "checksum" if body.isdigit() and len(body) == 8 else "bad-format"
    if country == "IE":
        return "checksum" if _ie_shape(body) else "bad-format"
    if country in {"GB", "UK"}:
        return "checksum" if body.isdigit() and len(body) in (9, 12) else "bad-format"
    lengths = _FORMAT_ONLY.get(country)
    if lengths is None:
        return "unknown"
    if body.isalnum() and len(body) in lengths:
        return "format"
    return "bad-format"


def _checksum_ok(country: str, body: str) -> bool:
    if country == "DE":
        return _de(body)
    if country == "FR":
        return _fr(body)
    if country == "BE":
        return _be(body)
    if country == "NL":
        return _nl(body)
    if country == "AT":
        return _at(body)
    if country == "IT":
        return _it(body)
    if country == "ES":
        return _es(body)
    if country == "PL":
        return _pl(body)
    if country == "SE":
        return _se(body)
    if country == "DK":
        return _dk(body)
    if country == "FI":
        return _fi(body)
    if country == "PT":
        return _pt(body)
    if country == "LU":
        return _lu(body)
    if country == "IE":
        return _ie(body)
    if country in {"GB", "UK"}:
        return _gb(body)
    return False


def _de(digits: str) -> bool:
    product = 10
    for char in digits[:8]:
        step = (int(char) + product) % 10
        if step == 0:
            step = 10
        product = (2 * step) % 11
    return (11 - product) % 10 == int(digits[8])


def _fr(body: str) -> bool:
    siren = body[2:]
    if not siren.isdigit():
        return False
    key = body[:2]
    if not key.isdigit():
        # Letter keys exist; this tool only checksums the numeric-key form.
        return True
    expected = (12 + 3 * (int(siren) % 97)) % 97
    return int(key) == expected


def _be(body: str) -> bool:
    digits = body[1:] if body.startswith("0") and len(body) == 11 else body
    if len(digits) == 9:
        digits = "0" + digits
    if len(digits) != 10 or not digits.isdigit():
        return False
    return (int(digits[:8]) % 97 + int(digits[8:])) % 97 == 0


def _nl(body: str) -> bool:
    # Elfproef (11-proof): weights 9..2 on the first eight digits, then the
    # ninth (check) digit at weight -1, not +1. range(9, 0, -1) gave every
    # digit including the last a positive weight, which fails real valid
    # Dutch VAT numbers (NL123456782B01, the standard example) and mis-scores
    # typo'd ones the same way.
    total = sum(int(digit) * weight for digit, weight in zip(body[:8], range(9, 1, -1)))
    total -= int(body[8])
    return total % 11 == 0


def _at(body: str) -> bool:
    digits = [int(char) for char in body[1:]]
    total = 0
    for index, digit in enumerate(digits[:7]):
        value = digit if index % 2 == 0 else digit * 2
        total += value if value < 10 else value - 9
    check = (10 - (total + 4) % 10) % 10
    return check == digits[7]


def _it(digits: str) -> bool:
    total = 0
    for index, char in enumerate(digits[:10]):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            value = value // 10 + value % 10
        total += value
    return (10 - total % 10) % 10 == int(digits[10])


def _es_shape(body: str) -> bool:
    if len(body) != 9:
        return False
    if body[0].isdigit() and body[8].isalpha() and body[1:8].isdigit():
        return True
    if body[0].isalpha() and body[1:8].isdigit() and body[8].isalnum():
        return True
    return False


def _es(body: str) -> bool:
    letters = "TRWAGMYFPDXBNJZSQVHLCKE"
    if body[0].isdigit() and body[8].isalpha():
        return body[8] == letters[int(body[:8]) % 23]
    if not body[0].isalpha() or not body[1:8].isdigit():
        return False
    total = 0
    for index, char in enumerate(body[1:8]):
        value = int(char) * (2 if index % 2 == 0 else 1)
        total += value // 10 + value % 10
    check = (10 - total % 10) % 10
    control = body[8]
    letter_controls = "JABCDEFGHI"
    if body[0] in "KLMNPQRSW":
        return control == letter_controls[check]
    if body[0] in "ABEH":
        return control == str(check)
    return control == str(check) or control == letter_controls[check]


def _pl(digits: str) -> bool:
    weights = (6, 5, 7, 2, 3, 4, 5, 6, 7)
    total = sum(int(digit) * weight for digit, weight in zip(digits[:9], weights))
    check = total % 11
    return check != 10 and check == int(digits[9])


def _luhn(digits: str) -> bool:
    total = 0
    reverse = digits[::-1]
    for index, char in enumerate(reverse):
        value = int(char)
        if index % 2 == 1:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return total % 10 == 0


def _se(digits: str) -> bool:
    org = digits[:10]
    return _luhn(org) and (len(digits) == 10 or digits[10:] == "01")


def _dk(digits: str) -> bool:
    weights = (2, 7, 6, 5, 4, 3, 2, 1)
    total = sum(int(digit) * weight for digit, weight in zip(digits, weights))
    return total % 11 == 0


def _fi(digits: str) -> bool:
    weights = (7, 9, 10, 5, 8, 4, 2)
    total = sum(int(digit) * weight for digit, weight in zip(digits[:7], weights))
    remainder = total % 11
    if remainder == 1:
        return False
    check = 0 if remainder == 0 else 11 - remainder
    return check == int(digits[7])


def _pt(digits: str) -> bool:
    weights = (9, 8, 7, 6, 5, 4, 3, 2)
    total = sum(int(digit) * weight for digit, weight in zip(digits[:8], weights))
    remainder = 11 - total % 11
    check = 0 if remainder >= 10 else remainder
    return check == int(digits[8])


def _lu(digits: str) -> bool:
    return int(digits[:6]) % 89 == int(digits[6:])


def _ie_shape(body: str) -> bool:
    if len(body) == 8 and body[0].isdigit() and body[7].isalpha() and body[1:7].isalnum():
        return True
    if len(body) == 9 and body[0].isdigit() and body[7].isalpha() and body[8].isalpha() and body[1:7].isdigit():
        return True
    return False


def _ie(body: str) -> bool:
    alphabet = "WABCDEFGHIJKLMNOPQRSTUV"
    if len(body) == 8:
        source = body[:7] if body[1].isdigit() else body[0] + "7" + body[2:7]
        numeric = []
        for char in source:
            if char.isdigit():
                numeric.append(int(char))
            elif char in alphabet:
                numeric.append(alphabet.index(char))
            else:
                return False
        if len(numeric) != 7:
            return False
        total = sum(value * weight for value, weight in zip(numeric, range(8, 1, -1)))
        return body[7] == alphabet[total % 23]
    if len(body) == 9 and body[:7].isdigit():
        numeric = [int(char) for char in body[:7]]
        extra = alphabet.index(body[8]) if body[8] in alphabet else -1
        if extra < 0:
            return False
        total = sum(value * weight for value, weight in zip(numeric, range(8, 1, -1))) + extra * 9
        return body[7] == alphabet[total % 23]
    return False


def _gb(digits: str) -> bool:
    weights = (8, 7, 6, 5, 4, 3, 2)
    total = sum(int(digit) * weight for digit, weight in zip(digits[:7], weights))
    check = int(digits[7:9])
    if len(digits) not in (9, 12):
        return False
    if len(digits) == 12 and digits[9:] != "000":
        return False
    return (total + check) % 97 == 0 or (total + 55 + check) % 97 == 0


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
