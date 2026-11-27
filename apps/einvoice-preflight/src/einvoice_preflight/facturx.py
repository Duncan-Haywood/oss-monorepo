"""Unwrap the e-invoice XML inside a Factur-X / ZUGFeRD / XRechnung PDF.

The PDF is a transport envelope. The invoice is the embedded file named
``factur-x.xml``, ``zugferd-invoice.xml``, or ``xrechnung.xml``. This module
finds that attachment and returns its bytes so ``formats.parse_bytes`` can
run the same UBL/CII checks as a bare XML drop.

It is not a PDF renderer, a signature verifier, or a Factur-X profile
validator. Encrypted PDFs are refused. External file specifications are
ignored — only bytes already in this file are read.
"""

from __future__ import annotations

import re
import zlib
from typing import Iterable


class EmbeddedInvoiceError(Exception):
    """The PDF could not be unwrapped into invoice XML."""


PREFERRED_NAMES = (
    "factur-x.xml",
    "zugferd-invoice.xml",
    "xrechnung.xml",
)

_NAME_RE = re.compile(rb"/F\s*\(([^)]+)\)")
_TYPE_EMBEDDED = re.compile(rb"/Type\s*/EmbeddedFile\b")
_FILTER_FLATE = re.compile(rb"/Filter\s*(?:/FlateDecode|\[\s*/FlateDecode\s*\])")
_LENGTH_RE = re.compile(rb"/Length\s+(\d+)(?:\s+(\d+)\s+R\b)?")


def looks_like_pdf(data: bytes) -> bool:
    """True when the leading bytes are a PDF header, ignoring a UTF-8 BOM."""
    return data.lstrip(b"\xef\xbb\xbf \t\r\n").startswith(b"%PDF-")


def safe_attachment_label(name: str) -> str:
    """Return a known Factur-X attachment name, or a generic label.

    Arbitrary PDF attachment names are attacker-controlled. Only the three
    standard invoice filenames are echoed back to the operator.
    """
    key = (name or "").strip().lower()
    return key if key in PREFERRED_NAMES else "embedded invoice XML"


def envelope_note(label: str, syntax: str) -> str:
    """One-line confirmation that a PDF envelope was opened."""
    return f"Unwrapped {label} ({syntax.upper()}) from the PDF."


def extract_embedded_invoice(data: bytes) -> tuple[bytes, str]:
    """Return ``(xml_bytes, safe_attachment_label)`` from a Factur-X-style PDF."""
    if not looks_like_pdf(data):
        raise EmbeddedInvoiceError("The file is not a PDF.")
    if _is_encrypted(data):
        raise EmbeddedInvoiceError(
            "This PDF is encrypted. Export the Factur-X file without a password "
            "or drop the embedded XML itself."
        )
    attachments = list(_embedded_files(data))
    if not attachments:
        raise EmbeddedInvoiceError(
            "This PDF has no embedded invoice file. Factur-X, ZUGFeRD, and "
            "XRechnung PDFs carry factur-x.xml, zugferd-invoice.xml, or "
            "xrechnung.xml as an attachment. A scanned paper PDF is not an "
            "e-invoice."
        )
    chosen = _prefer_invoice_attachment(attachments)
    if chosen is None:
        raise EmbeddedInvoiceError(
            "This PDF has embedded files, but none of them is UBL or "
            "CrossIndustryInvoice XML."
        )
    payload, name = chosen
    return payload, safe_attachment_label(name)


def extract_embedded_invoice_xml(data: bytes) -> bytes:
    """Return the embedded invoice XML bytes from a Factur-X-style PDF.

    Raises ``EmbeddedInvoiceError`` when the file is not a readable unencrypted
    PDF with an invoice XML attachment.
    """
    payload, _label = extract_embedded_invoice(data)
    return payload


def build_pdf_with_attachment(
    payload: bytes,
    filename: str = "factur-x.xml",
    *,
    flate: bool = False,
    encrypt: bool = False,
) -> bytes:
    """Build a minimal PDF 1.4 that carries ``payload`` as an embedded file.

    Used by tests and to ship ``examples/factur-x-invoice.pdf``. Not a
    general-purpose writer.
    """
    data = zlib.compress(payload) if flate else payload
    filter_line = "\n/Filter /FlateDecode" if flate else ""
    fname = (
        filename.replace("\\", "\\\\")
        .replace("(", "\\(")
        .replace(")", "\\)")
    )
    out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]

    def add_object(number: int, body: bytes) -> None:
        while len(offsets) <= number:
            offsets.append(0)
        offsets[number] = len(out)
        out.extend(f"{number} 0 obj\n".encode("ascii"))
        out.extend(body)
        if not body.endswith(b"\n"):
            out.extend(b"\n")
        out.extend(b"endobj\n")

    add_object(
        1,
        (
            f"<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 3 0 R >> "
            f"/AF [4 0 R] >>"
        ).encode("ascii"),
    )
    add_object(2, b"<< /Type /Pages /Kids [6 0 R] /Count 1 >>")
    add_object(3, f"<< /Names [({fname}) 4 0 R] >>".encode("ascii"))
    add_object(
        4,
        (
            f"<< /Type /Filespec /F ({fname}) /UF ({fname}) "
            f"/EF << /F 5 0 R >> /AFRelationship /Data >>"
        ).encode("ascii"),
    )
    stream = (
        f"<< /Type /EmbeddedFile /Subtype /text#2Fxml /Length {len(data)}"
        f"{filter_line} >>\nstream\n"
    ).encode("ascii") + data + b"\nendstream"
    add_object(5, stream)
    # One A4 page with a line of text, so viewers open the file instead of
    # reporting an empty page tree (poppler: "Invalid page count 0").
    add_object(
        6,
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] "
        b"/Resources << /Font << /F1 8 0 R >> >> /Contents 7 0 R >>",
    )
    page_text = b"BT /F1 14 Tf 56 780 Td (Test invoice envelope: the invoice is the attached factur-x.xml) Tj ET"
    add_object(
        7,
        b"<< /Length " + str(len(page_text)).encode("ascii") + b" >>\nstream\n" + page_text + b"\nendstream",
    )
    add_object(8, b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    xref_at = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n".encode("ascii"))
    out.extend(b"0000000000 65535 f \n")
    for number in range(1, len(offsets)):
        out.extend(f"{offsets[number]:010d} 00000 n \n".encode("ascii"))
    # A real encrypt dict is not required: refusal only looks at the trailer.
    encrypt_ref = " /Encrypt 9 0 R" if encrypt else ""
    out.extend(
        (
            f"trailer\n<< /Size {len(offsets)} /Root 1 0 R{encrypt_ref} >>\n"
            f"startxref\n{xref_at}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(out)


def _is_encrypted(data: bytes) -> bool:
    trailer = data[data.rfind(b"trailer") :] if b"trailer" in data else data[-2048:]
    return b"/Encrypt" in trailer


def _embedded_files(data: bytes) -> Iterable[tuple[str, bytes]]:
    for match in _TYPE_EMBEDDED.finditer(data):
        start = data.rfind(b"obj", 0, match.start())
        if start == -1:
            continue
        # Walk back to the object header so /F (name) on a Filespec nearby
        # can still be found; the name usually lives on the previous object.
        window_start = max(0, start - 512)
        window = data[window_start : match.start() + 800]
        name = _attachment_name(window)
        stream = _read_stream_after(data, match.start(), start)
        if stream is None:
            continue
        yield name, stream


def _attachment_name(window: bytes) -> str:
    names = _NAME_RE.findall(window)
    if not names:
        return ""
    raw = names[-1].replace(br"\(", b"(").replace(br"\)", b")").replace(br"\\", b"\\")
    return raw.decode("latin-1", errors="replace").strip()


def _declared_length(data: bytes, header: bytes) -> int | None:
    match = _LENGTH_RE.search(header)
    if not match:
        return None
    if match.group(2) is None:
        return int(match.group(1))
    target = re.search(
        rb"(?:^|[\s>])" + match.group(1) + rb"\s+" + match.group(2) + rb"\s+obj\s*(\d+)\s*endobj",
        data,
    )
    return int(target.group(1)) if target else None


def _read_stream_after(data: bytes, type_at: int, obj_at: int) -> bytes | None:
    # The whole object dictionary is the header: /Filter and /Length may come
    # before /Type, and /Length is often an indirect "N 0 R".
    stream_at = data.find(b"stream", type_at)
    if stream_at == -1 or stream_at - obj_at > 1024:
        return None
    header = data[obj_at:stream_at]
    after = stream_at + len(b"stream")
    if after < len(data) and data[after : after + 2] == b"\r\n":
        after += 2
    elif after < len(data) and data[after : after + 1] in (b"\n", b"\r"):
        after += 1
    length = _declared_length(data, header)
    if length is not None and re.match(rb"\s*endstream", data[after + length : after + length + 16]):
        payload = data[after : after + length]
    else:
        end = data.find(b"endstream", after)
        if end == -1:
            return None
        payload = data[after:end]
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        elif payload.endswith(b"\n") or payload.endswith(b"\r"):
            payload = payload[:-1]
    if _FILTER_FLATE.search(header):
        try:
            return zlib.decompress(payload)
        except zlib.error as exc:
            raise EmbeddedInvoiceError(
                "The embedded invoice stream is compressed in a way this tool "
                "cannot read. Export the XML from the PDF or drop the XML file."
            ) from exc
    return payload


def _prefer_invoice_attachment(
    attachments: list[tuple[str, bytes]],
) -> tuple[bytes, str] | None:
    by_name = {name.lower(): payload for name, payload in attachments}
    for preferred in PREFERRED_NAMES:
        payload = by_name.get(preferred)
        if payload is not None and _looks_like_invoice_xml(payload):
            return payload, preferred
    for name, payload in attachments:
        if _looks_like_invoice_xml(payload):
            return payload, name
    return None


def _looks_like_invoice_xml(data: bytes) -> bool:
    head = data.lstrip()[:4096]
    return (
        b"urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" in head
        or b"urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" in head
        or b"CrossIndustryInvoice" in head
    )
