"""Offline buyer/seller electronic-address (EndpointID) observations.

Peppol and many EN 16931 CIUS reject an invoice when the buyer or seller
electronic address is missing a scheme, uses an unknown EAS code, or fails
a published identifier shape. This is a document-shape and typo catch, not
a directory lookup and not a claim that the party can receive e-invoices.
Findings never repeat the address.
"""

from __future__ import annotations

from typing import Any

# Common Peppol Electronic Address Scheme (EAS) codes. Unknown codes are
# INV-039 so a typo like 088 or 00888 is visible before the network bounce.
_KNOWN_SCHEMES = frozenset({
    "0002", "0007", "0009", "0037", "0060", "0088", "0096", "0106", "0130", "0151",
    "0183", "0184", "0190", "0191", "0192", "0193", "0195", "0196", "0198",
    "0201", "0204", "0208", "0209", "0210", "0211", "0212", "0213", "0216",
    "0221", "0230", "0235", "0240",
    # OpenPeppol's EAS list as the PINT 1.1 rules carry it (phive-rules-peppol-pint 4.6.4);
    # mirrors endpoint.mjs (tests/test_js_parity.py).
    "0097", "0135", "0142", "0154", "0158", "0177", "0188", "0199", "0200", "0202",
    "0215", "0218", "0242", "0244", "0245", "0246", "0248", "9949", "9959",
    "9910", "9913", "9914", "9915", "9918", "9919",
    "9920", "9922", "9923", "9924", "9925", "9926", "9927", "9928", "9929",
    "9930", "9931", "9932", "9933", "9934", "9935", "9936", "9937", "9938",
    "9939", "9940", "9941", "9942", "9943", "9944", "9945", "9946", "9947",
    "9948", "9950", "9951", "9952", "9953", "9955", "9956", "9957", "9958",
    "EM",
    # In EN 16931's BR-CL-25 EAS list (plain/en16931-ubl.json), added 2026-11-17;
    # 0225 is the French reform's directory address, 0217 the KVK establishment number.
    "0147", "0170", "0194", "0203", "0205", "0217", "0225", "9960", "AN", "AQ", "AS", "AU",
})


def normalize_scheme(value: Any) -> str | None:
    """Uppercase and trim an EAS scheme. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    compact = value.strip().upper()
    return compact or None


def normalize_endpoint_id(value: Any) -> str | None:
    """Trim an electronic address. Empty or non-text becomes None."""
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped or None


def looks_like_known_scheme(value: Any) -> bool:
    """True when the value is a published Peppol EAS code we accept."""
    scheme = normalize_scheme(value)
    return scheme is not None and scheme in _KNOWN_SCHEMES


def inspect_party_endpoint(party: dict[str, Any], party_name: str) -> list[dict[str, str]]:
    """Return INV-039 / INV-040 / INV-041 observations for one party."""
    if "endpoint" not in party:
        return []
    endpoint = party.get("endpoint")
    if endpoint in (None, ""):
        return []
    path = f"/{party_name}/endpoint"
    if not isinstance(endpoint, dict):
        return [_finding(
            "INV-039",
            f"{party_name.title()} electronic address is not an object with scheme and id.",
            f"Use {party_name}.endpoint.scheme (EAS code) and {party_name}.endpoint.id, or omit endpoint.",
            path,
        )]

    findings: list[dict[str, str]] = []
    scheme = normalize_scheme(endpoint.get("scheme"))
    identifier = normalize_endpoint_id(endpoint.get("id"))
    if scheme is None or scheme not in _KNOWN_SCHEMES:
        findings.append(_finding(
            "INV-039",
            f"{party_name.title()} electronic-address scheme is missing or not a published EAS code.",
            "Use a Peppol EAS scheme such as 0088 (GLN), 0192, 0208, or EM, or omit endpoint.",
            f"{path}/scheme",
        ))
    if identifier is None:
        findings.append(_finding(
            "INV-040",
            f"{party_name.title()} electronic address is empty or not text.",
            f"Provide {party_name}.endpoint.id as text, or omit endpoint.",
            f"{path}/id",
        ))
    if scheme in _KNOWN_SCHEMES and identifier is not None and not _scheme_id_ok(scheme, identifier):
        findings.append(_finding(
            "INV-041",
            f"{party_name.title()} electronic address does not match the published {scheme} shape.",
            f"Correct the {scheme} identifier{_shape_hint(scheme)}. This is a format typo check, not a directory lookup.",
            f"{path}/id",
        ))
    return findings


# INV-061 (endpoint.mjs, 2026-11-17) is a warning for OpenPeppol's warning-level
# formats (0201, 0210, 0211, 0106, 0190, 9944, 0217). The Python checks have no
# warning severity, so it stays silent here rather than fail a file Peppol passes.


def inspect_party_endpoints(invoice: dict[str, Any]) -> list[dict[str, str]]:
    """Return endpoint observations for supplier and customer when present."""
    if not isinstance(invoice, dict):
        return []
    findings: list[dict[str, str]] = []
    for party_name in ("supplier", "customer"):
        party = invoice.get(party_name)
        if isinstance(party, dict):
            findings.extend(inspect_party_endpoint(party, party_name))
    return findings


# Checksummed and fixed-format schemes follow OpenPeppol's fatal PEPPOL-COMMON
# rules exactly (R040 GLN, R041 0192, R042 0184, R043 0208, R049 0007, R050 0151,
# R052 0096, R053 0198); mirrors endpoint.mjs and its differential,
# eval/endpoint-peppol-differential.mjs.
def _all_digits(value: str, length: int) -> bool:
    return len(value) == length and value.isascii() and value.isdigit()


def _gln_ok(identifier: str) -> bool:
    if not _all_digits(identifier, 13):
        return False
    total = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(identifier[:12]))
    return (10 - (total % 10)) % 10 == int(identifier[12])


def _mod11_no(identifier: str) -> bool:
    if not _all_digits(identifier, 9) or int(identifier) == 0:
        return False
    total = sum(int(identifier[7 - i]) * ((i % 6) + 2) for i in range(8))
    return (11 - (total % 11)) % 11 == int(identifier[8])


def _mod97_be(identifier: str) -> bool:
    if not _all_digits(identifier, 10):
        return False
    return int(identifier[8:]) == 97 - (int(identifier[:8]) % 97)


def _luhn_se(identifier: str) -> bool:
    if not _all_digits(identifier, 10):
        return False
    total = 0
    for pos in range(1, 10):
        digit = int(identifier[9 - pos])
        total += (digit * 2) % 10 + (digit * 2) // 10 if pos % 2 == 1 else digit
    return (10 - (total % 10)) % 10 == int(identifier[9])


def _abn_ok(identifier: str) -> bool:
    if not _all_digits(identifier, 11):
        return False
    weights = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
    total = sum((int(d) - (1 if i == 0 else 0)) * w for i, (d, w) in enumerate(zip(identifier, weights)))
    return total % 89 == 0


def _dk8(identifier: str) -> bool:
    return _all_digits(identifier, 8) or (identifier.startswith("DK") and _all_digits(identifier[2:], 8))


_SCHEME_CHECKS = {
    "0088": _gln_ok,
    "0192": _mod11_no,
    "0184": _dk8,
    "0096": lambda value: _all_digits(value, 10),
    "0198": lambda value: value.startswith("DK") and _all_digits(value[2:], 8),
    "0208": _mod97_be,
    "0007": _luhn_se,
    "0151": _abn_ok,
}

_SCHEME_SHAPES = {
    "0088": "13 digits with a GS1 check digit",
    "0192": "9 digits with a mod-11 check digit, no spaces or MVA",
    "0184": "8 digits, optionally after DK",
    "0096": "10 digits",
    "0198": "DK followed by 8 digits",
    "0208": "10 digits (the KBO/BCE number with its leading 0), no dots or BE prefix; the last two digits are 97 minus the first eight mod 97",
    "0007": "10 digits, no hyphen; the last is a Luhn check digit",
    "0151": "11 digits, no spaces; the ABN checksum must hold",
}


def _shape_hint(scheme: str) -> str:
    shape = _SCHEME_SHAPES.get(scheme)
    return f" ({shape})" if shape else ""


def _scheme_id_ok(scheme: str, identifier: str) -> bool:
    check = _SCHEME_CHECKS.get(scheme)
    if check is not None:
        return check(identifier)
    if scheme == "EM":
        return _email_ok(identifier)
    if scheme == "0190":
        return _digits(identifier, 20)
    if scheme == "0212":
        compact = "".join(ch for ch in identifier if ch.isalnum())
        return len(compact) in {8, 9} and compact[:-1].isdigit()
    compact = "".join(ch for ch in identifier if ch.isalnum() or ch in "@.-_:/+")
    return bool(compact)


def _digits(identifier: str, length: int) -> bool:
    compact = "".join(ch for ch in identifier if ch.isdigit())
    return len(compact) == length


def _email_ok(identifier: str) -> bool:
    if identifier != identifier.strip() or " " in identifier or identifier.count("@") != 1:
        return False
    local, domain = identifier.split("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}


# INV-062 (endpoint.mjs, 2026-11-17): OpenPeppol applies the same fatal
# PEPPOL-COMMON rules to PartyIdentification/ID and PartyLegalEntity/CompanyID
# as to the endpoint, so a JSON invoice's legal_id ({scheme, id}) and party_ids
# ([{scheme, id}]) meet them too. INV-063, the warning-level twin, stays silent
# here as INV-061 does: the Python checks have no warning severity.
def _inspect_one_identifier(entry: Any, label: str, what: str, path: str) -> list[dict[str, str]]:
    if not isinstance(entry, dict):
        return []
    scheme = normalize_scheme(entry.get("scheme"))
    identifier = normalize_endpoint_id(entry.get("id"))
    if scheme is None or identifier is None:
        return []
    check = _SCHEME_CHECKS.get(scheme)
    if check is None or check(identifier):
        return []
    return [_finding(
        "INV-062",
        f"{label} {what} does not match the {scheme} format OpenPeppol rejects on (PEPPOL-COMMON).",
        f"Correct the {scheme} identifier ({_SCHEME_SHAPES[scheme]}). Peppol applies the same check here as on "
        "the electronic address; this is a format check, not a registry lookup.",
        f"{path}/id",
    )]


def inspect_line_schemed_ids(line: Any, index: int) -> list[dict[str, str]]:
    """INV-062 on a CII line's schemed ids (BT-157 and the like; endpoint.mjs)."""
    if not isinstance(line, dict) or not isinstance(line.get("scheme_ids"), list):
        return []
    findings: list[dict[str, str]] = []
    for j, entry in enumerate(line["scheme_ids"]):
        findings.extend(_inspect_one_identifier(entry, f"Line {index + 1}", "identifier", f"/lines/{index}/scheme_ids/{j}"))
    return findings


def inspect_party_identifiers(party: Any, party_name: str, label: str | None = None) -> list[dict[str, str]]:
    """Return INV-062 observations for a party's legal_id and party_ids."""
    if not isinstance(party, dict):
        return []
    label = label or party_name.title()
    findings = _inspect_one_identifier(party.get("legal_id"), label, "legal registration identifier", f"/{party_name}/legal_id")
    party_ids = party.get("party_ids")
    if isinstance(party_ids, list):
        for index, entry in enumerate(party_ids):
            findings.extend(_inspect_one_identifier(entry, label, "identifier", f"/{party_name}/party_ids/{index}"))
    return findings
