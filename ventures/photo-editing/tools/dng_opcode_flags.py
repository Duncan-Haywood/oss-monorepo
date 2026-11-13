"""List every opcode in a DNG's three opcode lists with its flags, and what a full- and a preview-quality develop runs.

Flag bit 0 is "optional" and bit 1 "can be skipped for preview quality, needed
at full quality" (DNG 1.7.1.0, chapter 6, p. 104). Used to check which real
files carry bit 1, the flag ``dng_opcodes.plan`` honours since 2026-11-13.

Usage (from ``ventures/photo-editing``)::

    PYTHONPATH=src python3 tools/dng_opcode_flags.py FILE.dng [FILE.dng ...] [--json]

Results: ``eval/opcode-quality-flag-2026-11-13.md``.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from shootflow import dng_opcodes as do
from shootflow import raw_develop as rd

LISTS = ((do.TAG_OPCODE_LIST_1, "OpcodeList1"), (do.TAG_OPCODE_LIST_2, "OpcodeList2"), (do.TAG_OPCODE_LIST_3, "OpcodeList3"))


def survey(path: Path) -> dict:
    try:
        raw = rd.read_raw(path)
    except Exception as exc:  # a file this reader cannot open is reported, not fatal
        return {"file": path.name, "error": f"{type(exc).__name__}: {exc}"}
    lists = {}
    for tag, label in LISTS:
        blob = raw.ifd.get(tag) or raw.ifd0.get(tag)
        if not blob:
            continue
        try:
            ops = do.parse_list(bytes(blob))
        except do.OpcodeError as exc:
            lists[label] = f"unreadable: {exc}"
            continue
        lists[label] = [{"name": op.name, "flags": op.flags, "optional": op.optional, "full_quality_only": op.full_quality_only} for op in ops]
    cfa = raw.samples_per_pixel == 1
    full = do.plan(raw.ifd, raw.ifd0, cfa=cfa)
    preview = do.plan(raw.ifd, raw.ifd0, cfa=cfa, preview=True)
    return {
        "file": path.name,
        "lists": lists,
        "full_runs": len(full.stage1) + len(full.stage2) + len(full.stage3),
        "preview_runs": len(preview.stage1) + len(preview.stage2) + len(preview.stage3),
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("files", nargs="+", type=Path)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args(argv)
    rows = [survey(p) for p in args.files]
    if args.json:
        json.dump(rows, sys.stdout, indent=1)
        print()
        return 0
    for r in rows:
        if "error" in r:
            print(f"{r['file']}: not read ({r['error']})")
            continue
        if not r["lists"]:
            print(f"{r['file']}: no opcode lists")
            continue
        print(f"{r['file']}: runs {r['full_runs']} at full quality, {r['preview_runs']} at preview quality")
        for label, ops in r["lists"].items():
            if isinstance(ops, str):
                print(f"  {label}: {ops}")
                continue
            for op in ops:
                print(f"  {label}: {op['name']:<22} flags {op['flags']} (optional {op['optional']}, full quality only {op['full_quality_only']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
