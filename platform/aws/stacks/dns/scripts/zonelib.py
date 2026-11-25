"""Shared record handling for cf_export.py and zone_diff.py.

A record set is keyed by (fqdn, type), fqdn lowercase without the trailing
dot. Values are normalised so Cloudflare's and Route 53's spellings compare
equal: TXT unquoted and rejoined, hostnames lowercase without trailing dots,
MX/SRV with their priority in front.
"""
import re

# Cloudflare writes ttl=1 for "automatic", which it serves as 300.
CF_AUTO_TTL = 300
HOST_TYPES = {"CNAME", "NS", "PTR"}
TXT_CHUNK = re.compile(r'"((?:[^"\\]|\\.)*)"')


def fqdn(name, zone):
    name = name.rstrip(".").lower()
    zone = zone.rstrip(".").lower()
    if name in ("@", ""):
        return zone
    if name == zone or name.endswith("." + zone):
        return name
    return f"{name}.{zone}"


def relative(name, zone):
    name = fqdn(name, zone)
    zone = zone.rstrip(".").lower()
    return "@" if name == zone else name[: -(len(zone) + 1)]


def unquote_txt(value):
    """'"a" "b"' -> 'ab'; 'plain' -> 'plain'. Route 53 and newer Cloudflare
    exports quote TXT strings and split them at 255 characters."""
    value = value.strip()
    chunks = TXT_CHUNK.findall(value)
    if chunks and TXT_CHUNK.sub("", value).strip() == "":
        return "".join(c.replace('\\"', '"') for c in chunks)
    return value


def host(value):
    return value.strip().rstrip(".").lower()


def norm_value(rtype, value):
    rtype = rtype.upper()
    if rtype in ("TXT", "SPF"):
        return unquote_txt(value)
    if rtype in HOST_TYPES:
        return host(value)
    if rtype == "MX":
        prio, _, target = value.strip().partition(" ")
        return f"{int(prio)} {host(target) or '.'}"
    if rtype == "SRV":
        parts = value.split()
        return " ".join(parts[:3] + [host(parts[3])]) if len(parts) == 4 else value.strip()
    if rtype == "CAA":
        flags, tag, val = value.strip().split(" ", 2)
        return f"{int(flags)} {tag.lower()} {val.strip()}"
    if rtype == "AAAA":
        import ipaddress
        return str(ipaddress.ip_address(value.strip()))
    return value.strip()


def cf_value(rec):
    """The Route 53 spelling of one Cloudflare API record's value."""
    t = rec["type"].upper()
    if t == "MX":
        return norm_value(t, f'{rec.get("priority", 0)} {rec["content"]}')
    if t == "SRV":
        d = rec.get("data") or {}
        if d:
            return norm_value(t, f'{d["priority"]} {d["weight"]} {d["port"]} {d["target"]}')
        return norm_value(t, f'{rec.get("priority", 0)} {rec["content"]}')
    if t == "CAA" and rec.get("data"):
        d = rec["data"]
        return norm_value(t, f'{d["flags"]} {d["tag"]} "{d["value"]}"')
    return norm_value(t, rec["content"])


def cf_ttl(rec):
    ttl = int(rec.get("ttl", 1))
    return CF_AUTO_TTL if ttl == 1 else ttl
