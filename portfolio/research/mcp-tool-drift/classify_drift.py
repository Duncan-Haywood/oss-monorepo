#!/usr/bin/env python3
"""Classify MCP tool-declaration drift: is the churn worth alerting on?

Why this exists
---------------
`measure_drift.py` (same directory) ran step 1 of the `mcp-supply-chain-watch`
experiment and answered the kill question: tool surfaces move, 69% of adjacent
releases change something, 29% remove a tool. The base rate is not near zero.

Step 2 of that candidate's own experiment was left undone:

    "Hand-label the changes that do occur as cosmetic, schema-widening, or
     instruction-bearing, and check whether a model reproduces the labels."

Step 2 is the decisive one, because the candidate also names the failure mode it
tests:

    "Alert fatigue. Servers under active development change constantly. If the
     classifier cannot keep routine churn out of the instruction-bearing bucket,
     the alerts get muted and the product is dead."

A 69% drift rate is a product only if a small, stable fraction of it is worth a
human's attention. If most description changes land in the alerting bucket, the
subscription is a noise generator. If almost none do, there is nothing to sell.
This script measures where in that range reality sits.

What it does
------------
1. Re-walks the same population `measure_drift.py` used (official MCP registry
   -> npm-packaged servers -> sampled adjacent versions).
2. Extracts tool declarations with a wider extractor than `measure_drift.py`
   uses -- that script's own README names description under-counting as "the gap
   most worth closing next". See `extract_tools` below for what was added.
3. Emits the *text* of every before/after description pair that changed, not
   just a count, so the corpus can be labelled and re-labelled without
   re-fetching.
4. Applies a deterministic, rule-based classifier to each change, into the three
   buckets the candidate specifies plus one the data forced:

   cosmetic            Wording, punctuation, whitespace, typo, or formatting
                       moved; nothing a model reading the description would act
                       on differently.
   schema-widening     The tool's declared inputs changed -- a parameter or
                       enum value named in the description appeared or vanished.
                       Matters for integration, not for trust.
   instruction-bearing The new text addresses the *model* rather than describing
                       the tool: imperatives, priority claims, cross-tool
                       references, secret/credential mentions, URLs, or
                       exfiltration-shaped phrasing. This is the alert.
   capability-change   The described action itself changed (read -> write,
                       narrower -> broader scope). Not in the candidate's
                       taxonomy; separated out rather than folded into
                       "cosmetic", because it is a real signal with a different
                       response.

Deliberate limits
-----------------
* The classifier is *rules*, not a model. That is on purpose: the point is to
  produce labels that are reproducible from committed data, and to give the
  model-agreement check of step 2 something fixed to be checked against. A
  model's labels on this corpus belong in the write-up, not in this file.
* Rules are tuned to over-flag rather than under-flag. A false instruction-
  bearing label costs a customer one glance; a missed one is the failure the
  product exists to prevent. The measured rate is therefore a *ceiling* on
  alert volume, which is the conservative direction for the alert-fatigue
  question.
* Static extraction only. Same reason as `measure_drift.py`: running an
  untrusted MCP server to ask it `tools/list` is exactly the thing not to do.

Reads only public data (the MCP registry and the npm registry), sends nothing,
needs no credentials.

Usage
-----
    python3 classify_drift.py --limit 40 --out results-classified.json
    python3 classify_drift.py --recompute-from results-classified.json

The second form re-derives every number from the committed corpus with no
network access at all, so the classifier can be changed and the effect measured
without re-fetching a single tarball.

No third-party dependencies; standard library only.
"""

from __future__ import annotations

import argparse
import collections
import io
import json
import re
import sys
import tarfile
import time
import urllib.parse
import urllib.request

REGISTRY = "https://registry.modelcontextprotocol.io/v0/servers"
NPM = "https://registry.npmjs.org"
UA = {"User-Agent": "monorepo-projects-portfolio-research/1.0"}

SKIP_PATH = re.compile(r"(^|/)(node_modules|tests?|__tests__|examples?|docs?)/")
CODE_EXT = (".js", ".mjs", ".cjs", ".ts", ".tsx", ".json")
NOISE = re.compile(r"(default|index|main|name|type|string|object|number|boolean|error|Error)")

# ---------------------------------------------------------------------------
# Extraction
#
# measure_drift.py recovers a description only when it sits immediately after
# its name (`name: "x", description: "y"`). Three shapes it misses are common
# enough to matter, and all three are added here:
#
#   1. description before name       {description: "y", name: "x"}
#   2. template-literal descriptions  description: `multi
#                                                   line`
#   3. a `title:` or `annotations:` block sitting between the two keys
#
# Both extractors are run and their results merged, so this is a strict superset
# of what measure_drift.py sees -- never fewer descriptions, only more.
# ---------------------------------------------------------------------------

_NAME = r"['\"`]([A-Za-z0-9_.\-]{2,64})['\"`]"
_STR = r"['\"]([^'\"]{0,600})['\"]|`([^`]{0,600})`"
_GAP = r"(?:\s*,\s*(?:title|annotations|inputSchema|outputSchema|_meta)\s*:\s*(?:[^,{}]{0,120}|\{[^{}]{0,400}\})\s*)*"

TOOL_NAME_PATTERNS = [
    re.compile(r"\.registerTool\(\s*" + _NAME),
    re.compile(r"\.tool\(\s*" + _NAME),
    re.compile(r"\bname\s*:\s*" + _NAME + r"\s*,\s*description\s*:"),
    re.compile(r"['\"]name['\"]\s*:\s*['\"]([A-Za-z0-9_.\-]{2,64})['\"]\s*,\s*['\"]description['\"]\s*:"),
    # registerTool("x", { description: ... }) -- name and description separated
    # by the options-object brace, which the patterns above cannot cross.
    re.compile(r"\.registerTool\(\s*" + _NAME + r"\s*,\s*\{"),
]

DESC_PATTERNS = [
    # name ... description
    re.compile(r"\bname\s*:\s*" + _NAME + _GAP + r"\s*,\s*description\s*:\s*(?:" + _STR + r")"),
    # description ... name  (captured groups reordered by _desc_pairs)
    re.compile(r"\bdescription\s*:\s*(?:" + _STR + r")" + _GAP + r"\s*,\s*name\s*:\s*" + _NAME),
    # registerTool("x", { ... description: "y" ... })
    re.compile(r"\.registerTool\(\s*" + _NAME + r"\s*,\s*\{[^{}]{0,200}?description\s*:\s*(?:" + _STR + r")"),
    # tool("x", "y")  -- positional description, the SDK's terse form
    re.compile(r"\.tool\(\s*" + _NAME + r"\s*,\s*(?:" + _STR + r")\s*,"),
]


def _first(*groups) -> str:
    for g in groups:
        if g:
            return g
    return ""


def _desc_pairs(text: str):
    """Yield (tool_name, description) from every supported declaration shape."""
    for index, pattern in enumerate(DESC_PATTERNS):
        for m in pattern.finditer(text):
            groups = m.groups()
            if index == 1:  # description-first: (str, str, name)
                name = groups[2]
                desc = _first(groups[0], groups[1])
            else:  # name-first: (name, str, str)
                name = groups[0]
                desc = _first(groups[1], groups[2])
            if name and desc:
                yield name, desc


def fetch(url: str, timeout: int = 60) -> bytes:
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=UA), timeout=timeout
    ).read()


def fetch_json(url: str, timeout: int = 60):
    return json.loads(fetch(url, timeout))


def extract_tools(tarball: bytes) -> tuple[set[str], dict[str, str]]:
    """Statically recover (tool names, name -> description) from an npm tarball."""
    names: set[str] = set()
    descriptions: dict[str, str] = {}
    try:
        archive = tarfile.open(fileobj=io.BytesIO(tarball), mode="r:gz")
    except Exception:
        return names, descriptions

    for member in archive.getmembers():
        if not member.isfile() or member.size > 3_000_000:
            continue
        path = member.name
        if SKIP_PATH.search(path) or not path.endswith(CODE_EXT):
            continue
        if path.endswith(".json") and not path.endswith(
            ("server.json", "mcp.json", "tools.json")
        ):
            continue
        try:
            text = archive.extractfile(member).read().decode("utf-8", "ignore")
        except Exception:
            continue
        for pattern in TOOL_NAME_PATTERNS:
            names.update(m.group(1) for m in pattern.finditer(text))
        for name, desc in _desc_pairs(text):
            # Keep the longest declaration seen for a name: shipped packages
            # often contain both a bundled and an unbundled copy, and the
            # truncated one is the less informative of the two.
            if len(desc) > len(descriptions.get(name, "")):
                descriptions[name] = desc

    names = {n for n in names if not NOISE.fullmatch(n)}
    names |= set(descriptions)
    return names, descriptions


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------

# Text that addresses the model rather than describing the tool. Split by what
# each family is evidence of, so the write-up can report which one fires.
INSTRUCTION_SIGNALS = {
    "imperative_priority": re.compile(
        r"\b(you must|you should always|always use|always call|must always|"
        r"never (?:use|call|mention|reveal)|do not (?:use|mention|reveal|tell)|"
        r"be sure to|make sure (?:to|you)|it is (?:critical|essential|imperative)|"
        r"important:|note to (?:the )?(?:model|assistant|agent)|ignore (?:the |all )?previous)\b",
        re.I,
    ),
    "tool_routing": re.compile(
        r"\b(instead of (?:using |calling )?[`'\"]?\w+|before (?:using|calling) (?:any|the|this|other)|"
        r"prefer this (?:tool|over)|in place of the \w+ tool|"
        r"(?:this|use this) tool (?:first|before|instead)|do not use the \w+ tool|"
        # "use social_api_list_keys to find the key_id" -- naming another tool
        # and telling the model when to reach for it is routing by definition.
        r"use [a-z][a-z0-9]*_[a-z0-9_]{2,} (?:to|first|instead|before)\b)",
        re.I,
    ),
    "secret_or_credential": re.compile(
        r"\b(api[_ -]?key|secret|token|credential|password|\.env\b|"
        r"environment variable|auth(?:orization)? header|private key|ssh key)\b",
        re.I,
    ),
    "exfiltration_shaped": re.compile(
        r"\b(send (?:the |all )?(?:contents|results|output|data) to|"
        r"forward (?:the |all )?(?:contents|output|results)|upload (?:the|all)|"
        r"post (?:the |all )?(?:contents|results) to|report back to|"
        r"include the (?:full |entire )?(?:conversation|context|history))\b",
        re.I,
    ),
    "embedded_url": re.compile(r"https?://[^\s'\"`)]+", re.I),
}

# Widening of the declared input surface, as visible in prose.
SCHEMA_SIGNALS = re.compile(
    r"\b(parameter|argument|field|option|flag|accepts?|optional|required|"
    r"defaults? to|takes an?|`[a-z_][a-z0-9_]*`\s*(?:is|can|must)|"
    r"one of:|either|enum)\b",
    re.I,
)

# The described action itself moving.
CAPABILITY_VERBS = re.compile(
    r"\b(read|write|create|delete|remove|update|modify|execute|run|install|"
    r"upload|download|send|fetch|list|search|query|patch|deploy|publish)\b",
    re.I,
)


def normalise(text: str) -> str:
    """Strip everything a human would call presentation."""
    text = re.sub(r"\\[nrt]", " ", text)
    text = re.sub(r"[\s ]+", " ", text)
    text = re.sub(r"[`*_#>\[\]()]", "", text)
    text = re.sub(r"[.,;:!?]+", "", text)
    return text.strip().lower()


def _sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"(?<=[.!?;])\s+|\n+", text) if s.strip()]


def added_text(old: str, new: str) -> str:
    """Sentences present in `new` whose normalised form is absent from `old`."""
    old_norm = {normalise(s) for s in _sentences(old)}
    fresh = [s for s in _sentences(new) if normalise(s) not in old_norm]
    if fresh:
        return " ".join(fresh)
    # No whole sentence is new, but the text still changed: fall back to the
    # words that appeared, so a single injected clause is not invisible here.
    old_words = set(normalise(old).split())
    return " ".join(w for w in normalise(new).split() if w not in old_words)


# A capability verb preceded by an article or adjective is a noun ("a ranked
# list of results"), not a new action. Checked against the matched span's left
# context before a capability-change is declared.
NOUN_CONTEXT = re.compile(
    r"\b(a|an|the|any|this|that|each|full|ranked|paginated|complete|"
    r"sorted|filtered|detailed|numbered|bulleted)\s+$",
    re.I,
)


def _new_signal_spans(pattern: re.Pattern, old: str, new: str) -> list[str]:
    """Matches in `new` whose own text does not already occur in `old`.

    This is the fix for the dominant false positive found by hand-labelling the
    first pass (see README, "Where the first classifier was wrong"). Signals
    were matched against whole *sentences* judged new, so rewording a sentence
    that merely mentioned an API key re-flagged it as instruction-bearing even
    though the credential wording was there before the change. Requiring the
    matched span itself to be new drops that class without weakening detection
    of genuinely injected text.
    """
    old_norm = normalise(old)
    fresh = []
    for m in pattern.finditer(new):
        span = normalise(m.group(0))
        if span and span not in old_norm:
            fresh.append(m.group(0))
    return fresh


def _new_capability_verbs(old: str, new: str) -> list[str]:
    old_verbs = {v.lower() for v in CAPABILITY_VERBS.findall(old)}
    found = []
    for m in CAPABILITY_VERBS.finditer(new):
        verb = m.group(0).lower()
        if verb in old_verbs or verb in found:
            continue
        if NOUN_CONTEXT.search(new[max(0, m.start() - 24): m.start()]):
            continue  # "a ranked list of results" -- a noun, not a new action
        found.append(verb)
    return sorted(found)


def classify(old: str, new: str, strict: bool = True) -> dict:
    """Label one description change. Returns bucket + the evidence for it.

    `strict=False` reproduces the first-pass classifier, whose labels the
    hand-labelling pass was run against. Kept so the correction is measurable
    from the committed corpus rather than asserted.
    """
    if normalise(old) == normalise(new):
        return {"bucket": "cosmetic", "reason": "identical after normalisation", "signals": []}

    fresh = added_text(old, new)
    signals = []
    evidence = []
    for name, pattern in INSTRUCTION_SIGNALS.items():
        if strict:
            spans = _new_signal_spans(pattern, old, new)
            if spans:
                signals.append(name)
                evidence.extend(spans[:3])
        elif pattern.search(fresh):
            signals.append(name)

    if signals:
        return {
            "bucket": "instruction-bearing",
            "reason": "new text addresses the model",
            "signals": signals,
            "evidence": evidence[:5],
            "added": fresh[:400],
        }

    if strict:
        new_verbs = _new_capability_verbs(old, new)
    else:
        old_verbs = {v.lower() for v in CAPABILITY_VERBS.findall(old)}
        new_verbs = sorted({v.lower() for v in CAPABILITY_VERBS.findall(new)} - old_verbs)
    if new_verbs:
        return {
            "bucket": "capability-change",
            "reason": "the described action changed",
            "signals": new_verbs,
            "added": fresh[:400],
        }

    if SCHEMA_SIGNALS.search(fresh):
        return {
            "bucket": "schema-widening",
            "reason": "input surface described differently",
            "signals": [],
            "added": fresh[:400],
        }

    return {"bucket": "cosmetic", "reason": "wording moved, meaning did not", "signals": [], "added": fresh[:400]}


# ---------------------------------------------------------------------------
# Corpus collection
# ---------------------------------------------------------------------------


def registry_servers(max_pages: int = 40, pause: float = 0.15) -> list[dict]:
    out: list[dict] = []
    cursor = None
    for _ in range(max_pages):
        url = f"{REGISTRY}?limit=100" + (f"&cursor={cursor}" if cursor else "")
        try:
            page = fetch_json(url, timeout=45)
        except Exception as exc:
            print(f"registry paging stopped: {exc}", file=sys.stderr)
            break
        out.extend(page.get("servers", []))
        cursor = page.get("metadata", {}).get("nextCursor")
        if not cursor:
            break
        time.sleep(pause)
    return out


def npm_packaged_servers(records: list[dict]) -> list[tuple[str, str, int]]:
    by_name: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in records:
        by_name[rec["server"]["name"]].append(rec)

    found: list[tuple[str, str, int]] = []
    for name, recs in by_name.items():
        packages = set()
        for rec in recs:
            for pkg in rec["server"].get("packages") or []:
                registry_type = (
                    pkg.get("registryType") or pkg.get("registry_name") or ""
                ).lower()
                identifier = pkg.get("identifier") or pkg.get("name")
                if registry_type == "npm" and identifier:
                    packages.add(identifier)
        found.extend((name, p, len(recs)) for p in packages)

    found.sort(key=lambda row: -row[2])
    seen: set[str] = set()
    unique = []
    for name, pkg, count in found:
        if pkg not in seen:
            seen.add(pkg)
            unique.append((name, pkg, count))
    return unique


def ordered_versions(meta: dict) -> list[str]:
    times = meta.get("time", {})
    return sorted(
        (v for v in meta.get("versions", {}) if v in times), key=lambda v: times[v]
    )


def collect(targets, samples: int, pause: float) -> list[dict]:
    """One record per *description change*, carrying the before and after text."""
    changes: list[dict] = []
    pairs_seen = 0
    pairs_with_shared_tools = 0

    for server, pkg, _ in targets:
        try:
            meta = fetch_json(f"{NPM}/{urllib.parse.quote(pkg, safe='@')}")
        except Exception as exc:
            print(f"{pkg}: metadata fetch failed: {exc}", file=sys.stderr)
            continue
        versions = ordered_versions(meta)
        if len(versions) < 2:
            continue
        if len(versions) > samples:
            step = (len(versions) - 1) / (samples - 1)
            picked = sorted({round(i * step) for i in range(samples)})
            versions = [versions[i] for i in picked]

        previous = None
        previous_version = None
        found_here = 0
        for version in versions:
            try:
                current = extract_tools(fetch(meta["versions"][version]["dist"]["tarball"]))
            except Exception:
                continue
            if previous is not None:
                pairs_seen += 1
                shared = set(previous[1]) & set(current[1])
                if shared:
                    pairs_with_shared_tools += 1
                for tool in sorted(shared):
                    old, new = previous[1][tool], current[1][tool]
                    if old != new:
                        changes.append(
                            {
                                "pkg": pkg,
                                "server": server,
                                "tool": tool,
                                "from": previous_version,
                                "to": version,
                                "t": meta["time"][version][:10],
                                "old": old,
                                "new": new,
                            }
                        )
                        found_here += 1
            previous, previous_version = current, version
            time.sleep(pause)
        if found_here:
            print(f"{pkg}: {found_here} description changes", flush=True)

    return changes, {"version_pairs": pairs_seen, "pairs_with_shared_tools": pairs_with_shared_tools}


def summarise(changes: list[dict], coverage: dict) -> dict:
    buckets = collections.Counter(c["label"]["bucket"] for c in changes)
    signals = collections.Counter(
        s for c in changes for s in c["label"].get("signals", [])
        if c["label"]["bucket"] == "instruction-bearing"
    )
    total = len(changes) or 1
    by_pkg = collections.Counter(c["pkg"] for c in changes)
    alerting = buckets["instruction-bearing"]
    return {
        "description_changes": len(changes),
        "packages_with_changes": len(by_pkg),
        "coverage": coverage,
        "buckets": {k: {"n": v, "pct": round(v / total * 100, 1)} for k, v in buckets.most_common()},
        "instruction_bearing_signals": dict(signals.most_common()),
        "alerting_share_pct": round(alerting / total * 100, 1),
        "changes_per_package_median": sorted(by_pkg.values())[len(by_pkg) // 2] if by_pkg else 0,
        "noisiest_package": by_pkg.most_common(1)[0] if by_pkg else None,
    }


def label_all(changes: list[dict], strict: bool = True) -> list[dict]:
    for change in changes:
        change["label"] = classify(change["old"], change["new"], strict=strict)
    return changes


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--limit", type=int, default=40, help="packages to analyse")
    ap.add_argument("--samples", type=int, default=8, help="versions sampled per package")
    ap.add_argument("--pages", type=int, default=40, help="registry pages to read")
    ap.add_argument("--pause", type=float, default=0.1, help="seconds between requests")
    ap.add_argument("--out", default=None, help="write corpus + summary as JSON")
    ap.add_argument(
        "--recompute-from",
        default=None,
        help="re-label a committed corpus offline; no network access at all",
    )
    ap.add_argument(
        "--lenient",
        action="store_true",
        help="reproduce the first-pass classifier that hand-labelling corrected",
    )
    args = ap.parse_args()
    strict = not args.lenient

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            data = json.load(fh)
        changes = label_all(data["changes"], strict=strict)
        summary = summarise(changes, data["summary"].get("coverage", {}))
        print(json.dumps(summary, indent=2))
        if args.out:
            with open(args.out, "w") as fh:
                json.dump({"summary": summary, "changes": changes}, fh, indent=1)
            print(f"\nwrote {args.out}")
        return 0

    print("Reading the official MCP registry...", flush=True)
    records = registry_servers(max_pages=args.pages, pause=args.pause)
    print(f"  {len(records)} version records", flush=True)

    targets = npm_packaged_servers(records)
    print(f"  {len(targets)} distinct npm-packaged servers; analysing {min(args.limit, len(targets))}\n", flush=True)
    targets = targets[: args.limit]

    changes, coverage = collect(targets, args.samples, args.pause)
    changes = label_all(changes, strict=strict)
    summary = summarise(changes, coverage)

    print("\n=== summary ===")
    print(json.dumps(summary, indent=2))

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"summary": summary, "changes": changes}, fh, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
