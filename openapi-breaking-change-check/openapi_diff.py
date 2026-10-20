#!/usr/bin/env python3
"""Diff two OpenAPI 3.x documents and report which changes would break an
existing client -- a removed endpoint, a parameter that became required, a
narrowed type, a removed enum value, or a request body that became required.

    python3 openapi_diff.py old.json new.json                    # human-readable
    python3 openapi_diff.py old.json new.json --format json       # machine-readable
    python3 openapi_diff.py old.json new.json --fail-on-breaking  # exit 2 if any breaking change is found

## The problem this solves

Publishing a new version of an API is routine; publishing one that silently
breaks an existing integration is not supposed to be. The two most common
ways that happens are both invisible in a normal code review of the
*implementation*: a required parameter gets added to an operation the
frontend already calls, or an endpoint quietly disappears during a refactor.
Neither shows up in a diff of application code reviewed by a human who is
not also holding the API contract in their head.

This tool instead diffs the *contract* -- the OpenAPI document -- structurally,
and classifies every difference as breaking or not, so the question "did
this change anything a client depends on" has a yes/no answer before the
version ships.

## What counts as breaking here

  - An operation (method + path) is removed.
  - A parameter that did not exist, or was optional, becomes required.
  - An existing parameter's declared type changes (e.g. string -> integer).
  - An enum value a client might still send is removed from a parameter's
    schema, including the case where the parameter had no enum at all
    before (a client could send any value, and now most of them are
    rejected).
  - A request body becomes required where it was previously optional or
    absent.

## What is explicitly out of scope

This is a **shallow, structural** diff of paths, operations, and
parameter/request-body shape -- it does **not** deep-diff request or
response body JSON Schemas beyond a parameter's own `type`/`enum`, and it
does not look at response schemas, security requirements, or servers at
all. A field added deep inside a request body's schema, or a response
schema narrowing, will not be reported. It makes no claim about semantic
compatibility (a renamed-but-equivalent field looks identical to an
unrelated removal-and-addition) and no claim about runtime behavior --
only about what the two documents declare.

## Formats understood

OpenAPI **3.0.x** and **3.1.x** JSON documents only. Swagger 2.0 is
detected and explicitly rejected with a message explaining why (its
`parameters` and body shape differ enough that silently trying to read it
as OpenAPI 3 would misreport, which is worse than refusing). YAML is not
parsed -- convert to JSON first (`docker run --rm -v "$PWD:/w" mikefarah/yq
-o=json eval /w/spec.yaml`, or any OpenAPI tool's own YAML-to-JSON export).

## $ref resolution

Local `#/...` JSON Pointer refs are resolved, including refs inside
`components.parameters`, `components.requestBodies`, and path items
themselves, so a spec that uses shared, referenced parameters (the common
case) is read the same as one that inlines everything. External refs
(another file, a URL) are not fetched -- this tool makes no network calls
of any kind -- and are treated as unresolved (empty shape).

Exit status: 0 normally (even with differences found, unless
--fail-on-breaking), 2 if --fail-on-breaking was given and at least one
breaking change was found.
"""

import argparse
import json
import sys
from pathlib import Path

HTTP_METHODS = ("get", "put", "post", "delete", "options", "head", "patch", "trace")


def detect_format(doc):
    """Return {"supported": True, "version": ...} or {"supported": False, "reason": ...}."""
    if not isinstance(doc, dict):
        return {"supported": False, "reason": "not a JSON object"}
    if isinstance(doc.get("swagger"), str):
        return {
            "supported": False,
            "reason": f'Swagger {doc["swagger"]} is not supported yet -- this tool reads OpenAPI 3.0/3.1 documents only',
        }
    version = doc.get("openapi")
    if isinstance(version, str) and version.startswith(("3.0", "3.1")):
        return {"supported": True, "version": version}
    if isinstance(version, str):
        return {
            "supported": False,
            "reason": f'unrecognized OpenAPI version "{version}" -- this tool reads OpenAPI 3.0/3.1 documents only',
        }
    return {"supported": False, "reason": 'no "openapi" field found -- expected a top-level "openapi": "3.0.x" or "3.1.x"'}


def _unescape_pointer_segment(segment):
    return segment.replace("~1", "/").replace("~0", "~")


def _resolve_ref(doc, ref, seen=None):
    if seen is None:
        seen = set()
    if not isinstance(ref, str) or not ref.startswith("#/"):
        return None
    if ref in seen:
        return None
    seen.add(ref)
    node = doc
    for part in ref[2:].split("/"):
        part = _unescape_pointer_segment(part)
        if not isinstance(node, dict):
            return None
        node = node.get(part)
    if isinstance(node, dict) and isinstance(node.get("$ref"), str):
        return _resolve_ref(doc, node["$ref"], seen)
    return node


def _resolve_maybe_ref(doc, value):
    if isinstance(value, dict) and isinstance(value.get("$ref"), str):
        return _resolve_ref(doc, value["$ref"]) or {}
    return value or {}


def _param_schema_shape(doc, param):
    schema = _resolve_maybe_ref(doc, param.get("schema"))
    enum_value = schema.get("enum")
    return {
        "type": schema.get("type"),
        "enum": enum_value if isinstance(enum_value, list) else None,
    }


def _merge_params(path_params, op_params):
    merged = {}
    for p in path_params:
        merged[(p.get("in"), p.get("name"))] = p
    for p in op_params:
        merged[(p.get("in"), p.get("name"))] = p  # operation params override path-level ones
    return list(merged.values())


def extract_operations(doc):
    """Walk a parsed OpenAPI 3.x document into a dict keyed by
    "METHOD /path", each value {"parameters": {"in:name": {...}}, "request_body_required": bool|None}."""
    operations = {}
    for raw_path, raw_item in (doc.get("paths") or {}).items():
        path_item = _resolve_maybe_ref(doc, raw_item)
        path_level_params = [_resolve_maybe_ref(doc, p) for p in (path_item.get("parameters") or [])]
        for method in HTTP_METHODS:
            op = path_item.get(method)
            if not isinstance(op, dict):
                continue
            op_params = [_resolve_maybe_ref(doc, p) for p in (op.get("parameters") or [])]
            merged = _merge_params(path_level_params, op_params)
            parameters = {}
            for p in merged:
                name, loc = p.get("name"), p.get("in")
                if not name or not loc:
                    continue
                shape = _param_schema_shape(doc, p)
                parameters[f"{loc}:{name}"] = {
                    "name": name,
                    "in": loc,
                    "required": bool(p.get("required")),
                    "type": shape["type"],
                    "enum": shape["enum"],
                }
            request_body_required = None
            if op.get("requestBody"):
                rb = _resolve_maybe_ref(doc, op["requestBody"])
                request_body_required = bool(rb.get("required"))
            operations[f"{method.upper()} {raw_path}"] = {
                "parameters": parameters,
                "request_body_required": request_body_required,
            }
    return operations


def parse_openapi(text, label="<spec>"):
    """Parse OpenAPI JSON text. Returns (version, operations). Raises
    ValueError naming `label` if the document is not valid JSON or not a
    supported OpenAPI 3.x document."""
    try:
        doc = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{label}: not valid JSON ({exc})") from exc
    fmt = detect_format(doc)
    if not fmt["supported"]:
        raise ValueError(f"{label}: {fmt['reason']}")
    return fmt["version"], extract_operations(doc)


def _param_changes(operation_key, old_params, new_params):
    breaking = []
    non_breaking = []
    for key in sorted(set(old_params) | set(new_params)):
        before = old_params.get(key)
        after = new_params.get(key)
        if before is None and after is not None:
            entry = {
                "operation": operation_key,
                "parameter": key,
                "type": "new-required-param" if after["required"] else "new-optional-param",
            }
            (breaking if after["required"] else non_breaking).append(entry)
            continue
        if before is not None and after is None:
            non_breaking.append({"operation": operation_key, "parameter": key, "type": "removed-param"})
            continue
        if not before["required"] and after["required"]:
            breaking.append({"operation": operation_key, "parameter": key, "type": "param-now-required"})
        if before["type"] and after["type"] and before["type"] != after["type"]:
            breaking.append(
                {"operation": operation_key, "parameter": key, "type": "param-type-changed", "from": before["type"], "to": after["type"]}
            )
        if before["enum"] and after["enum"]:
            lost = [v for v in before["enum"] if v not in after["enum"]]
            gained = [v for v in after["enum"] if v not in before["enum"]]
            if lost:
                breaking.append({"operation": operation_key, "parameter": key, "type": "removed-enum-value", "values": lost})
            if gained:
                non_breaking.append({"operation": operation_key, "parameter": key, "type": "added-enum-value", "values": gained})
        elif not before["enum"] and after["enum"]:
            # A parameter that previously accepted any value of its type now
            # accepts only the listed ones -- every value outside the new
            # enum is a value a client could have been sending that the API
            # now rejects, the same shape as removed-enum-value with an
            # unbounded "before".
            breaking.append({"operation": operation_key, "parameter": key, "type": "enum-added", "values": after["enum"]})
        elif before["enum"] and not after["enum"]:
            # The reverse: the enum constraint is gone, so anything a client
            # sent before is still accepted, plus more. Widening, not
            # narrowing.
            non_breaking.append({"operation": operation_key, "parameter": key, "type": "enum-removed", "values": before["enum"]})
    return breaking, non_breaking


def diff_operations(old_ops, new_ops):
    """Compare two operation dicts. Returns {"breaking": [...], "non_breaking": [...]}."""
    breaking = []
    non_breaking = []
    for key in sorted(set(old_ops) | set(new_ops)):
        before = old_ops.get(key)
        after = new_ops.get(key)
        if before is None:
            non_breaking.append({"operation": key, "type": "added-operation"})
            continue
        if after is None:
            breaking.append({"operation": key, "type": "removed-operation"})
            continue
        param_breaking, param_non_breaking = _param_changes(key, before["parameters"], after["parameters"])
        breaking.extend(param_breaking)
        non_breaking.extend(param_non_breaking)

        if before["request_body_required"] != after["request_body_required"]:
            if not before["request_body_required"] and after["request_body_required"]:
                breaking.append({"operation": key, "type": "request-body-now-required"})
            else:
                non_breaking.append({"operation": key, "type": "request-body-no-longer-required"})
    return {"breaking": breaking, "non_breaking": non_breaking}


def has_breaking_change(diff):
    return bool(diff["breaking"])


def render_text(diff):
    if not diff["breaking"] and not diff["non_breaking"]:
        return "No differences found -- these two API versions describe the same operations, parameters, and request bodies."

    lines = []
    if diff["breaking"]:
        lines.append(f"Breaking changes ({len(diff['breaking'])}):")
        for c in diff["breaking"]:
            lines.append(f"  ! {_describe(c)}")
        lines.append("")
    if diff["non_breaking"]:
        lines.append(f"Non-breaking changes ({len(diff['non_breaking'])}):")
        for c in diff["non_breaking"]:
            lines.append(f"  ~ {_describe(c)}")
        lines.append("")

    if diff["breaking"]:
        lines.append(f"{len(diff['breaking'])} breaking change(s) found, plus {len(diff['non_breaking'])} non-breaking change(s).")
    else:
        lines.append(f"No breaking changes. {len(diff['non_breaking'])} non-breaking change(s) found (new/removed optional things).")
    return "\n".join(lines)


def _describe(change):
    op = change["operation"]
    t = change["type"]
    if t == "removed-operation":
        return f"{op}: operation removed"
    if t == "added-operation":
        return f"{op}: operation added"
    if t == "new-required-param":
        return f"{op}: new required parameter {change['parameter']}"
    if t == "new-optional-param":
        return f"{op}: new optional parameter {change['parameter']}"
    if t == "removed-param":
        return f"{op}: parameter {change['parameter']} removed"
    if t == "param-now-required":
        return f"{op}: parameter {change['parameter']} is now required"
    if t == "param-type-changed":
        return f"{op}: parameter {change['parameter']} type changed {change['from']} -> {change['to']}"
    if t == "removed-enum-value":
        return f"{op}: parameter {change['parameter']} lost enum value(s) {change['values']}"
    if t == "added-enum-value":
        return f"{op}: parameter {change['parameter']} gained enum value(s) {change['values']}"
    if t == "enum-added":
        return f"{op}: parameter {change['parameter']} is now restricted to enum value(s) {change['values']} (previously unrestricted)"
    if t == "enum-removed":
        return f"{op}: parameter {change['parameter']} is no longer restricted to enum value(s) {change['values']}"
    if t == "request-body-now-required":
        return f"{op}: request body is now required"
    if t == "request-body-no-longer-required":
        return f"{op}: request body is no longer required"
    return f"{op}: {t}"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("old", help="path to the earlier OpenAPI 3.x document (JSON)")
    parser.add_argument("new", help="path to the later OpenAPI 3.x document (JSON)")
    parser.add_argument("--format", choices=("text", "json"), default="text", help="output format")
    parser.add_argument(
        "--fail-on-breaking",
        action="store_true",
        help="exit 2 if at least one breaking change is found (non-breaking changes never fail the build)",
    )
    args = parser.parse_args(argv)

    try:
        old_text = Path(args.old).read_text(encoding="utf-8")
        new_text = Path(args.new).read_text(encoding="utf-8")
    except OSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    try:
        _, old_ops = parse_openapi(old_text, label=args.old)
        _, new_ops = parse_openapi(new_text, label=args.new)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    diff = diff_operations(old_ops, new_ops)

    if args.format == "json":
        print(json.dumps(diff, indent=2))
    else:
        print(render_text(diff))

    if args.fail_on_breaking and has_breaking_change(diff):
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
