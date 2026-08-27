"""Capture customer-authorized DNS observations from named resolvers.

The compare command only diffs snapshots. Capture is the missing first step:
an MSP records what named resolvers answer *now*, later records them again,
and diffs the two files. This module never writes DNS records and does not
claim a domain is secure, deliverable, or compliant.
"""

from __future__ import annotations

import ipaddress
import json
import os
import secrets
import socket
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from .report import load_snapshot

RECORD_TYPES = {
    "A": 1,
    "NS": 2,
    "CNAME": 5,
    "MX": 15,
    "TXT": 16,
    "AAAA": 28,
}
TYPE_NAMES = {code: name for name, code in RECORD_TYPES.items()}
CLASS_IN = 1
MAX_QUERIES = 50
MAX_RESOLVERS = 10
MIN_TIMEOUT = 0.1
MAX_TIMEOUT = 30.0
UNCERTAIN_STATUSES = {"timeout", "refused", "error"}

SNAPSHOT_LIMITATIONS = [
    "These are observations from the named resolvers only; they do not establish global DNS truth.",
    "Timeouts, refusals, and transport errors are recorded as inconclusive statuses, not as empty answers.",
    "The customer must authorize each capture and decide whether a later change needs remediation.",
]


class CaptureError(ValueError):
    """Invalid capture plan or query request."""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def name_in_authorized_domain(name: str, domain: str) -> bool:
    host = name.lower().rstrip(".")
    apex = domain.lower().rstrip(".")
    return host == apex or host.endswith("." + apex)


def load_plan(path: str | Path | None = None, raw: dict[str, Any] | None = None) -> dict[str, Any]:
    if raw is None:
        if path is None:
            raise CaptureError("capture requires a plan file or explicit domain, queries, and resolvers")
        try:
            loaded = json.loads(Path(path).read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise CaptureError("capture plan is not valid JSON") from error
        if not isinstance(loaded, dict):
            raise CaptureError("capture plan must be a JSON object")
        raw = loaded
    if raw.get("authorized") is not True:
        raise CaptureError("capture plan must declare authorized: true")
    domain = raw.get("domain")
    if not isinstance(domain, str) or not domain.strip():
        raise CaptureError("capture plan must include a customer-authorized domain")
    queries = raw.get("queries")
    if not isinstance(queries, list) or not queries:
        raise CaptureError("capture plan must include a non-empty queries list")
    if len(queries) > MAX_QUERIES:
        raise CaptureError(f"capture plan exceeds {MAX_QUERIES} queries")
    normalized_queries: list[dict[str, str]] = []
    seen_queries: set[tuple[str, str]] = set()
    for query in queries:
        if not isinstance(query, dict):
            raise CaptureError("each query must be an object with name and type")
        name = query.get("name")
        rtype = query.get("type")
        if not isinstance(name, str) or not name.strip():
            raise CaptureError("each query needs a DNS name")
        if not isinstance(rtype, str) or rtype.upper() not in RECORD_TYPES:
            allowed = ", ".join(sorted(RECORD_TYPES))
            raise CaptureError(f"unsupported query type {rtype!r}; use one of {allowed}")
        name = name.strip().rstrip(".")
        rtype = rtype.upper()
        if not name_in_authorized_domain(name, domain):
            raise CaptureError(f"query name {name!r} is outside the authorized domain {domain}")
        identity = (name.lower(), rtype)
        if identity in seen_queries:
            raise CaptureError("capture plan contains duplicate name/type queries")
        seen_queries.add(identity)
        normalized_queries.append({"name": name, "type": rtype})
    resolvers = _normalize_resolvers(raw.get("resolvers"))
    timeout = raw.get("timeout", 3.0)
    if not isinstance(timeout, (int, float)) or isinstance(timeout, bool):
        raise CaptureError("timeout must be a number of seconds")
    timeout = float(timeout)
    if timeout < MIN_TIMEOUT or timeout > MAX_TIMEOUT:
        raise CaptureError(f"timeout must be between {MIN_TIMEOUT} and {MAX_TIMEOUT} seconds")
    return {
        "authorized": True,
        "domain": domain.strip(),
        "queries": normalized_queries,
        "resolvers": resolvers,
        "timeout": timeout,
    }


def _normalize_resolvers(resolvers: Any) -> list[dict[str, str]]:
    if not isinstance(resolvers, list) or not resolvers:
        raise CaptureError("capture plan must include a non-empty resolvers list")
    if len(resolvers) > MAX_RESOLVERS:
        raise CaptureError(f"capture plan exceeds {MAX_RESOLVERS} resolvers")
    normalized: list[dict[str, str]] = []
    seen: set[str] = set()
    for item in resolvers:
        if isinstance(item, str):
            label, address = item.strip(), item.strip()
        elif isinstance(item, dict):
            label = str(item.get("id") or item.get("label") or item.get("address") or "").strip()
            address = str(item.get("address") or item.get("id") or "").strip()
        else:
            raise CaptureError("each resolver must be an address string or {id, address} object")
        if not label or not address:
            raise CaptureError("each resolver needs an id and an address")
        if label in seen:
            raise CaptureError("capture plan contains duplicate resolver ids")
        seen.add(label)
        _resolve_address(address)
        normalized.append({"id": label, "address": address})
    return normalized


def _resolve_address(address: str) -> tuple[str, int]:
    try:
        parsed = ipaddress.ip_address(address)
        family = socket.AF_INET6 if parsed.version == 6 else socket.AF_INET
        return str(parsed), family
    except ValueError:
        pass
    try:
        infos = socket.getaddrinfo(address, 53, type=socket.SOCK_DGRAM)
    except socket.gaierror as error:
        raise CaptureError(f"resolver address {address!r} could not be resolved") from error
    if not infos:
        raise CaptureError(f"resolver address {address!r} could not be resolved")
    family = infos[0][0]
    sockaddr = infos[0][4]
    return sockaddr[0], family


def encode_qname(name: str) -> bytes:
    if name in (".", ""):
        return b"\x00"
    encoded = b""
    for label in name.rstrip(".").split("."):
        raw = label.encode("idna")
        if not raw or len(raw) > 63:
            raise CaptureError(f"invalid DNS label in {name!r}")
        encoded += bytes([len(raw)]) + raw
    return encoded + b"\x00"


def decode_qname(message: bytes, offset: int) -> tuple[str, int]:
    labels: list[str] = []
    jumped = False
    cursor = offset
    hops = 0
    end = offset
    while hops < 20:
        if cursor >= len(message):
            raise CaptureError("truncated DNS name")
        length = message[cursor]
        if length == 0:
            if not jumped:
                end = cursor + 1
            break
        if length & 0xC0 == 0xC0:
            if cursor + 1 >= len(message):
                raise CaptureError("truncated DNS compression pointer")
            pointer = ((length & 0x3F) << 8) | message[cursor + 1]
            if pointer >= len(message):
                raise CaptureError("DNS compression pointer out of range")
            if not jumped:
                end = cursor + 2
            cursor = pointer
            jumped = True
            hops += 1
            continue
        if length & 0xC0:
            raise CaptureError("unsupported DNS name encoding")
        cursor += 1
        if cursor + length > len(message):
            raise CaptureError("truncated DNS label")
        labels.append(message[cursor : cursor + length].decode("idna", errors="strict"))
        cursor += length
        if not jumped:
            end = cursor
    else:
        raise CaptureError("DNS name compression loop")
    return ".".join(labels) if labels else ".", end


def build_query(name: str, rtype: str, query_id: int | None = None) -> bytes:
    header_id = secrets.randbelow(65536) if query_id is None else query_id
    header = struct.pack("!HHHHHH", header_id, 0x0100, 1, 0, 0, 0)
    question = encode_qname(name) + struct.pack("!HH", RECORD_TYPES[rtype], CLASS_IN)
    return header + question


def format_rdata(rtype: int, rdata: bytes, message: bytes, rdata_offset: int) -> str:
    if rtype == RECORD_TYPES["A"] and len(rdata) == 4:
        return socket.inet_ntop(socket.AF_INET, rdata)
    if rtype == RECORD_TYPES["AAAA"] and len(rdata) == 16:
        return socket.inet_ntop(socket.AF_INET6, rdata)
    if rtype == RECORD_TYPES["MX"] and len(rdata) >= 3:
        preference = struct.unpack("!H", rdata[:2])[0]
        exchange, _ = decode_qname(message, rdata_offset + 2)
        return f"{preference} {exchange}"
    if rtype in (RECORD_TYPES["NS"], RECORD_TYPES["CNAME"]) and rdata:
        target, _ = decode_qname(message, rdata_offset)
        return target
    if rtype == RECORD_TYPES["TXT"]:
        chunks: list[str] = []
        cursor = 0
        while cursor < len(rdata):
            length = rdata[cursor]
            cursor += 1
            chunks.append(rdata[cursor : cursor + length].decode("utf-8", errors="replace"))
            cursor += length
        return "".join(chunks)
    return rdata.hex()


def parse_response(message: bytes, query_id: int, expected_type: str) -> list[str] | str:
    if len(message) < 12:
        return "error"
    ident, flags, qdcount, ancount, _nscount, _arcount = struct.unpack("!HHHHHH", message[:12])
    if ident != query_id:
        return "error"
    rcode = flags & 0x000F
    if rcode == 5:
        return "refused"
    if rcode not in (0, 3):
        return "error"
    offset = 12
    try:
        for _ in range(qdcount):
            _name, offset = decode_qname(message, offset)
            offset += 4
        requested = RECORD_TYPES[expected_type]
        typed: list[str] = []
        others: list[str] = []
        for _ in range(ancount):
            _owner, offset = decode_qname(message, offset)
            if offset + 10 > len(message):
                return "error"
            rtype, _rclass, _ttl, rdlength = struct.unpack("!HHIH", message[offset : offset + 10])
            offset += 10
            if offset + rdlength > len(message):
                return "error"
            rendered = format_rdata(rtype, message[offset : offset + rdlength], message, offset)
            offset += rdlength
            if rtype == requested:
                typed.append(rendered)
            else:
                type_name = TYPE_NAMES.get(rtype, str(rtype))
                others.append(f"{type_name} {rendered}")
    except (CaptureError, UnicodeError, struct.error, ValueError, OSError):
        return "error"
    return typed if typed else others


def _exchange(query: bytes, address: str, timeout: float) -> bytes:
    host, family = _resolve_address(address)
    sock = socket.socket(family, socket.SOCK_DGRAM)
    try:
        sock.settimeout(timeout)
        sock.sendto(query, (host, 53))
        payload, _ = sock.recvfrom(4096)
    finally:
        sock.close()
    if len(payload) >= 12 and (struct.unpack("!H", payload[2:4])[0] & 0x0200):
        return _exchange_tcp(query, host, family, timeout)
    return payload


def _exchange_tcp(query: bytes, host: str, family: int, timeout: float) -> bytes:
    sock = socket.socket(family, socket.SOCK_STREAM)
    try:
        sock.settimeout(timeout)
        sock.connect((host, 53))
        sock.sendall(struct.pack("!H", len(query)) + query)
        header = _recv_exact(sock, 2)
        length = struct.unpack("!H", header)[0]
        return _recv_exact(sock, length)
    finally:
        sock.close()


def _recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks = b""
    while len(chunks) < size:
        piece = sock.recv(size - len(chunks))
        if not piece:
            raise socket.timeout("resolver closed the TCP response")
        chunks += piece
    return chunks


def query_resolver(name: str, rtype: str, resolver: str, timeout: float = 3.0) -> dict[str, Any]:
    query_id = secrets.randbelow(65536)
    query = build_query(name, rtype, query_id=query_id)
    observation: dict[str, Any] = {
        "name": name,
        "type": rtype,
        "resolver": resolver,
        "observed_at": utc_now(),
    }
    try:
        payload = _exchange(query, resolver, timeout)
        parsed = parse_response(payload, query_id, rtype)
    except socket.timeout:
        observation["status"] = "timeout"
        return observation
    except (OSError, CaptureError, ValueError, struct.error):
        observation["status"] = "error"
        return observation
    if isinstance(parsed, str):
        observation["status"] = parsed
        return observation
    observation["answers"] = parsed
    return observation


Querier = Callable[[str, str, str, float], dict[str, Any]]


def capture_snapshot(plan: dict[str, Any], querier: Querier = query_resolver) -> dict[str, Any]:
    normalized = load_plan(raw=plan)
    observations = []
    for resolver in normalized["resolvers"]:
        for query in normalized["queries"]:
            result = querier(query["name"], query["type"], resolver["address"], normalized["timeout"])
            result["resolver"] = resolver["id"]
            if "answers" not in result and result.get("status") not in UNCERTAIN_STATUSES:
                result["status"] = "error"
            observations.append(result)
    snapshot = {
        "authorized": True,
        "domain": normalized["domain"],
        "captured_at": utc_now(),
        "tool": "dns-configuration-evidence",
        "observations": observations,
        "limitations": list(SNAPSHOT_LIMITATIONS),
    }
    return load_snapshot(snapshot)


def write_snapshot(snapshot: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def plan_from_cli(
    *,
    domain: str | None,
    authorized: bool,
    queries: list[str],
    resolvers: list[str],
    timeout: float,
    plan_path: Path | None,
) -> dict[str, Any]:
    if plan_path is not None:
        plan = load_plan(plan_path)
        if domain or queries or resolvers:
            raise CaptureError("use a plan file or CLI flags, not both")
        plan["timeout"] = timeout if timeout != 3.0 else plan["timeout"]
        return plan
    if not authorized:
        raise CaptureError("capture requires --authorized (or authorized: true in the plan)")
    parsed_queries = []
    for item in queries:
        if ":" not in item:
            raise CaptureError("each --query must be name:TYPE, for example example.test:A")
        name, rtype = item.rsplit(":", 1)
        parsed_queries.append({"name": name, "type": rtype})
    return load_plan(
        raw={
            "authorized": True,
            "domain": domain,
            "queries": parsed_queries,
            "resolvers": resolvers,
            "timeout": timeout,
        }
    )
