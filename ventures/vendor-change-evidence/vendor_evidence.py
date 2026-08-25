#!/usr/bin/env python3
"""Capture and compare customer-selected public vendor pages."""
import argparse
import datetime as dt
import difflib
import hashlib
import json
import pathlib
import urllib.request


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")


def load_source(url, file):
    if file:
        return pathlib.Path(file).read_text(encoding="utf-8"), "file", None
    request = urllib.request.Request(url, headers={"User-Agent": "vendor-change-evidence/0.1"})
    with urllib.request.urlopen(request, timeout=15) as response:
        return response.read().decode("utf-8", errors="replace"), "url", response.status


def capture(args):
    if bool(args.url) == bool(args.file):
        raise SystemExit("provide exactly one of --url or --file")
    text, source_type, status = load_source(args.url, args.file)
    source = args.url or str(pathlib.Path(args.file).resolve())
    record = {"captured_at": now(), "source": source, "source_type": source_type,
              "status": status, "sha256": hashlib.sha256(text.encode()).hexdigest(), "text": text}
    store = pathlib.Path(args.store)
    store.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(source.encode()).hexdigest()[:16]
    stamp = record["captured_at"].replace(":", "").replace("+00:00", "Z")
    path = store / f"{key}-{stamp}.json"
    suffix = 2
    while path.exists():
        path = store / f"{key}-{stamp}-{suffix}.json"
        suffix += 1
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    if args.usage_file:
        increment(args.usage_file, "snapshot_captured")
    print(path)


def records(store, source):
    found = []
    for path in pathlib.Path(store).glob("*.json"):
        record = json.loads(path.read_text(encoding="utf-8"))
        if record.get("source") == source:
            found.append((record.get("captured_at", ""), record))
    return [record for _, record in sorted(found)]


def diff_report(args):
    source = args.url or str(pathlib.Path(args.file).resolve())
    history = records(args.store, source)
    if not history:
        raise SystemExit("no snapshots found for this source")
    current = history[-1]
    previous = history[-2] if len(history) > 1 else None
    changed = previous is not None and current["sha256"] != previous["sha256"]
    lines = ["# Vendor change evidence", "", f"Source: {source}", f"Checked: {current['captured_at']}",
             f"Fetch status: {current.get('status') or 'local file'}", f"Changed since prior snapshot: {'yes' if changed else 'no'}", ""]
    if previous is None:
        lines.append("Baseline captured; there is no earlier snapshot to compare.")
    elif changed:
        lines += ["## Raw line diff", "", "```diff"]
        lines += list(difflib.unified_diff(previous["text"].splitlines(), current["text"].splitlines(),
                                           fromfile=previous["captured_at"], tofile=current["captured_at"], lineterm=""))
        lines += ["```", "", "Review the source and decide whether the change has contractual or security significance."]
    else:
        lines.append("The captured content hash matches the prior snapshot.")
    if args.usage_file:
        increment(args.usage_file, "report_generated")
    print("\n".join(lines) if args.format == "markdown" else json.dumps({"source": source, "current": current, "previous": previous, "changed": changed}, indent=2))


def increment(path, event):
    target = pathlib.Path(path)
    data = json.loads(target.read_text(encoding="utf-8")) if target.exists() else {}
    data[event] = data.get(event, 0) + 1
    target.write_text(json.dumps(data, sort_keys=True) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Capture source-linked vendor page change evidence")
    sub = parser.add_subparsers(required=True)
    cap = sub.add_parser("capture")
    cap.add_argument("--url"); cap.add_argument("--file"); cap.add_argument("--store", default="snapshots"); cap.add_argument("--usage-file")
    cap.set_defaults(func=capture)
    report = sub.add_parser("diff")
    report.add_argument("--url"); report.add_argument("--file"); report.add_argument("--store", default="snapshots"); report.add_argument("--format", choices=["markdown", "json"], default="markdown"); report.add_argument("--usage-file")
    report.set_defaults(func=diff_report)
    args = parser.parse_args(); args.func(args)


if __name__ == "__main__":
    main()
