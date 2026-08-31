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
    "0002", "0007", "0009", "0037", "0060", "0088", "0096", "0130", "0151",
    "0183", "0184", "0190", "0191", "0192", "0193", "0195", "0196", "0198",
    "0201", "0204", "0208", "0209", "0210", "0211", "0212", "0213", "0216",
    "0221", "0230", "0235", "0240",
    "9910", "9913", "9914", "9915", "9918", "9919",
    "9920", "9922", "9923", "9924", "9925", "9926", "9927", "9928", "9929",
    "9930", "9931", "9932", "9933", "9934", "9935", "9936", "9937", "9938",
    "9939", "9940", "9941", "9942", "9943", "9944", "9945", "9946", "9947",
    "9948", "9950", "9951", "9952", "9953", "9955", "9956", "9957", "9958",
    "EM",
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
            f"Correct the {scheme} identifier. This is a format typo check, not a directory lookup.",
            f"{path}/id",
        ))
    return findings


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


def _scheme_id_ok(scheme: str, identifier: str) -> bool:
    if scheme == "0088":
        return _gln_ok(identifier)
    if scheme == "EM":
        return _email_ok(identifier)
    if scheme == "0007":
        return _digits(identifier, 10)
    if scheme == "0184":
        return _digits(identifier, 8)
    if scheme == "0190":
        return _digits(identifier, 20)
    if scheme == "0192":
        return _digits(identifier, 9)
    if scheme == "0208":
        return _digits(identifier, 10)
    if scheme == "0212":
        compact = "".join(ch for ch in identifier if ch.isalnum())
        return len(compact) in {8, 9} and compact[:-1].isdigit()
    compact = "".join(ch for ch in identifier if ch.isalnum() or ch in "@.-_:/+")
    return bool(compact)


def _digits(identifier: str, length: int) -> bool:
    compact = "".join(ch for ch in identifier if ch.isdigit())
    return len(compact) == length


def _gln_ok(identifier: str) -> bool:
    digits = "".join(ch for ch in identifier if ch.isdigit())
    if len(digits) != 13:
        return False
    total = sum(int(digit) * (1 if index % 2 == 0 else 3) for index, digit in enumerate(digits[:12]))
    check = (10 - (total % 10)) % 10
    return check == int(digits[12])


def _email_ok(identifier: str) -> bool:
    if identifier != identifier.strip() or " " in identifier or identifier.count("@") != 1:
        return False
    local, domain = identifier.split("@")
    return bool(local) and "." in domain and not domain.startswith(".") and not domain.endswith(".")


def _finding(rule: str, message: str, fix: str, path: str) -> dict[str, str]:
    return {"rule": rule, "message": message, "fix": fix, "path": path}
