#!/usr/bin/env python3
"""Compile platform/email/inboxes.yaml into the two JSON files read at run time.

    python3 platform/email/gen_config.py           # write both files
    python3 platform/email/gen_config.py --check   # exit 1 if either is stale

Outputs:
  platform/email/inboxes.json                  the mail Worker's config
  platform/pages/cloudflare/email-routing.json Email Routing's desired state,
                                               also read by the AWS email-ops
                                               stack's SES receipt rule

Validation is strict on purpose: a typo in a routing file silently loses
mail, so an unknown key, a duplicate address, a personal address or a bad
retention value stops the build instead.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import yaml

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
SRC = HERE / "inboxes.yaml"
OUT_WORKER = HERE / "inboxes.json"
OUT_ROUTING = ROOT / "platform" / "pages" / "cloudflare" / "email-routing.json"

LOCAL_RE = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
DOMAIN_RE = re.compile(r"^[a-z0-9-]+(\.[a-z0-9-]+)+$")
INBOX_KEYS = {"local", "owner", "purpose", "retention_days", "forward_to_owner", "auto_reply", "flag_all"}
DEFAULT_KEYS = {"retention_days", "forward_to_owner", "auto_reply", "flag_all"}
TOP_KEYS = {"version", "domain", "worker", "defaults", "sending", "flag_to_owner", "outreach", "dmarc", "inboxes"}
SENDING_KEYS = {"provider", "daily_cap", "per_recipient_daily_cap", "max_body_chars"}
PROVIDERS = {"cloudflare", "ses", "none"}
FLAG_REASONS = {"legal", "refund", "security", "human_request", "chargeback", "data_request"}
DMARC_POLICIES = {"none", "quarantine", "reject"}


class ConfigError(ValueError):
    pass


def _need(cond: bool, msg: str) -> None:
    if not cond:
        raise ConfigError(msg)


def _unknown(d: dict, allowed: set, where: str) -> None:
    extra = set(d) - allowed
    _need(not extra, f"{where}: unknown key(s) {sorted(extra)}")


def _bool(v, where):
    _need(isinstance(v, bool), f"{where} must be true or false")
    return v


def _int(v, where, lo, hi):
    _need(isinstance(v, int) and not isinstance(v, bool) and lo <= v <= hi, f"{where} must be an integer {lo}..{hi}")
    return v


def compile_config(raw: dict) -> dict:
    _need(isinstance(raw, dict), "inboxes.yaml must be a mapping")
    _unknown(raw, TOP_KEYS, "top level")
    _need(raw.get("version") == 1, "version must be 1")
    domain = str(raw.get("domain", ""))
    _need(bool(DOMAIN_RE.match(domain)), f"bad domain: {domain!r}")
    worker = str(raw.get("worker", ""))
    _need(bool(re.match(r"^[a-z0-9-]{1,63}$", worker)), f"bad worker name: {worker!r}")

    defaults = raw.get("defaults") or {}
    _unknown(defaults, DEFAULT_KEYS, "defaults")

    sending = raw.get("sending") or {}
    _unknown(sending, SENDING_KEYS, "sending")
    _need(sending.get("provider") in PROVIDERS, f"sending.provider must be one of {sorted(PROVIDERS)}")
    sending_out = {
        "provider": sending["provider"],
        "daily_cap": _int(sending.get("daily_cap", 50), "sending.daily_cap", 0, 1000),
        "per_recipient_daily_cap": _int(sending.get("per_recipient_daily_cap", 3), "sending.per_recipient_daily_cap", 0, 20),
        "max_body_chars": _int(sending.get("max_body_chars", 20000), "sending.max_body_chars", 100, 100000),
    }

    flags = raw.get("flag_to_owner") or []
    _need(isinstance(flags, list) and set(flags) <= FLAG_REASONS, f"flag_to_owner must be a subset of {sorted(FLAG_REASONS)}")
    # These four are the brief's floor (legal, refund, security, a human asked
    # for): the file may add reasons but never drop these.
    floor = {"legal", "refund", "security", "human_request"}
    _need(floor <= set(flags), f"flag_to_owner must include {sorted(floor)}")

    outreach = raw.get("outreach") or {}
    _unknown(outreach, {"marketing", "cold"}, "outreach")
    _need(outreach.get("cold", False) is False,
          "outreach.cold must stay false: cold mail goes through the email-ops cold stream on its own domain")
    outreach_out = {"marketing": _bool(outreach.get("marketing", False), "outreach.marketing"), "cold": False}

    inboxes = raw.get("inboxes") or []
    _need(isinstance(inboxes, list) and inboxes, "inboxes must be a non-empty list")
    out, seen = [], set()
    for i, box in enumerate(inboxes):
        where = f"inboxes[{i}]"
        _need(isinstance(box, dict), f"{where} must be a mapping")
        _unknown(box, INBOX_KEYS, where)
        local = str(box.get("local", ""))
        _need(bool(LOCAL_RE.match(local)), f"{where}: bad local part {local!r}")
        _need(local not in seen, f"{where}: {local}@ listed twice")
        seen.add(local)
        owner = str(box.get("owner", ""))
        _need(bool(re.match(r"^[a-z0-9-]{2,40}$", owner)), f"{where}: owner must be a slug")
        purpose = str(box.get("purpose", "")).strip()
        _need(purpose and "@" not in purpose, f"{where}: purpose is required and must not contain an address")
        merged = {**{"retention_days": 90, "forward_to_owner": False, "auto_reply": True, "flag_all": False}, **defaults, **box}
        out.append({
            "local": local,
            "address": f"{local}@{domain}",
            "owner": owner,
            "purpose": purpose,
            "retention_days": _int(merged["retention_days"], f"{where}.retention_days", 1, 3650),
            "forward_to_owner": _bool(merged["forward_to_owner"], f"{where}.forward_to_owner"),
            "auto_reply": _bool(merged["auto_reply"], f"{where}.auto_reply"),
            "flag_all": _bool(merged["flag_all"], f"{where}.flag_all"),
        })

    dmarc = raw.get("dmarc") or {}
    _unknown(dmarc, {"policy", "rua"}, "dmarc")
    _need(dmarc.get("policy") in DMARC_POLICIES, f"dmarc.policy must be one of {sorted(DMARC_POLICIES)}")
    _need(dmarc.get("rua") in seen, "dmarc.rua must name an inbox in this file")

    return {
        "version": 1,
        "domain": domain,
        "worker": worker,
        "sending": sending_out,
        "flag_to_owner": sorted(flags),
        "outreach": outreach_out,
        "dmarc": {"policy": dmarc["policy"], "rua_local": dmarc["rua"]},
        "inboxes": out,
    }


def routing_json(cfg: dict) -> dict:
    """The routing file's shape is older than this config (email-routing.mjs,
    platform/distribution/setup.mjs and the email-ops stack read it), so it
    keeps `zone`, `addresses[{local, purpose}]` and `deliver_to_worker`."""
    return {
        "_generated": "from platform/email/inboxes.yaml by platform/email/gen_config.py; edit that file, not this one",
        "zone": cfg["domain"],
        "addresses": [{"local": b["local"], "purpose": b["purpose"]} for b in cfg["inboxes"]],
        "deliver_to_worker": cfg["worker"],
        "owner_destination": any(b["forward_to_owner"] for b in cfg["inboxes"]),
        "dmarc": cfg["dmarc"],
    }


def render(obj: dict) -> str:
    return json.dumps(obj, indent=2, ensure_ascii=False) + "\n"


def main(argv: list[str]) -> int:
    cfg = compile_config(yaml.safe_load(SRC.read_text(encoding="utf-8")))
    outputs = {OUT_WORKER: render(cfg), OUT_ROUTING: render(routing_json(cfg))}
    stale = [p for p, text in outputs.items() if not p.exists() or p.read_text(encoding="utf-8") != text]
    if "--check" in argv:
        for p in stale:
            print(f"stale: {p.relative_to(ROOT)} (run python3 platform/email/gen_config.py)", file=sys.stderr)
        return 1 if stale else 0
    for p, text in outputs.items():
        p.write_text(text, encoding="utf-8")
    print(f"wrote {len(outputs)} files ({len(stale)} changed)")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except ConfigError as e:
        print(f"inboxes.yaml: {e}", file=sys.stderr)
        sys.exit(2)
