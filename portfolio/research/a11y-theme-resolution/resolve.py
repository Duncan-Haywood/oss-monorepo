#!/usr/bin/env python3
"""Resolve the theme-recoverable undecidables against the theme's own data.

Why this exists
---------------
Three passes now sit on top of each other, each closing the gap the last one
named:

  1. `portfolio/research/a11y-evidence-record/` audits storefront templates and
     measures that **63.2%** of what the audit touches is *undecidable* --
     `aria-label="{{ 'cart.title' | t }}"` has a name whose value is unknown
     until something renders it.
  2. `portfolio/research/a11y-render-recovery/` asks *whose data fills each
     one*, and splits "rendering closes almost all of it" into three shares:
     **50.5% theme-recoverable** (a build step, no store data), 11.0% merchant
     (per-store), 38.5% context (undecidable even as to provenance).
  3. That directory's own "What could not be measured here" names this gap:

         "**No actual render.** This is a static classification of what each
          expression points at. [...] This measures the ceiling on what
          rendering *can* recover from the template alone."

So the theme-recoverable share is a **ceiling**, and nobody has measured what
it recovers *to*. That distinction is the whole commercial question for the
pipeline's top-ranked candidate
(`portfolio/pipeline/candidates/eaa-remediation-pipeline.md`), whose wedge is a
free qualification pass run before quoting:

  - If the theme-recoverable share resolves overwhelmingly to **names that are
    present**, the build step is a *clearing* step. It raises the audit's
    honest coverage but hands the merchant nothing to look at, and the
    qualification pass has to sell on the findings the static audit already
    reports.
  - If a material share resolves to **no name at all**, those are real blocking
    failures that ship in the theme itself -- present at *every* store that
    installs it, findable at zero marginal cost, and exactly what a free
    qualification pass exists to put in front of a buyer.

This file measures which. It does not render: it resolves each name-giving
expression against the data the theme package itself ships -- its locale files,
its settings schema defaults, and its other partials -- which is precisely the
data a build-time render would have and no more.

What it resolves, and how
-------------------------
Only the two theme-recoverable buckets `a11y-render-recovery` defines are in
scope. Everything else is left exactly where that pass put it.

`theme_structural` -- a control whose `<label for=ID>` was not found in its own
file. Resolution is package-wide assembly, in two tiers:

  - **literal match** -- a literal `<label for="ID">` in any markup file of the
    package.
  - **expression match** -- the control's `id` and some label's `for` are the
    *same template text*, e.g. `id="{{ id_prefix }}FirstName"` against
    `for="{{ id_prefix }}FirstName"`. Identical expressions render identically
    in one render context, which is exactly what assembling the page does.
    Tracked separately by whether the match is in the same file or another
    partial, because a same-file match is certain and a cross-partial one
    assumes the two partials are rendered into the same page.

The expression tier is not an optimisation -- it is most of the bucket. `audit`
records the expression-stripped id (`id="{{ id_prefix }}FirstName"` arrives as
`FirstName`) and skips any `<label for>` whose target is an expression, so a
control and its label can sit six lines apart in one file and still be reported
undecidable. Resolving on the raw template text is what a render would do.

`theme` -- the name comes from theme-owned expressions. Each is resolved
against the package:

  | expression                        | resolved against            |
  |-----------------------------------|-----------------------------|
  | `{{ 'a.b' | t }}`, `$t('a.b')`    | the package's locale files  |
  | `{{ 'Add to cart' }}`             | itself (hardcoded literal)  |
  | `{{ section.settings.heading }}`  | the settings schema default |
  | `{{ section.id }}`                | structural, see below       |

Outcomes, and why there are five
--------------------------------
  - **named** -- resolves to a determinate non-empty human name. A pass: the
    build step settles it and there is nothing to report.
  - **unnamed** -- resolves to a determinate *empty* name. A real blocking
    failure shipped in the theme, identical at every store that installs it.
  - **placeholder** -- resolves non-empty, to a machine artifact: a translation
    key with no entry in the theme's own locale file (Liquid renders
    `Translation missing: en.a.b`; Vue i18n echoes the key), or a structural id
    used as a name. Deliberately *not* counted as a blocking failure -- the
    control has an accessible name -- but it is a determinate content defect,
    and separating it is what keeps `unnamed` honest.
  - **merchant_deferred** -- a theme setting with no default. The rendered name
    is whatever the merchant types, so the element leaves the theme share and
    joins the per-store share. `a11y-render-recovery` predicted this direction
    ("the 11.0% merchant share is a lower bound"); this pass measures it.
  - **unresolved** -- the package alone does not settle it: no locale data
    shipped, a dynamic translation key, an id built from an expression, or a
    theme root this pass does not model.

Faithfulness
------------
The population is taken verbatim from `classify.py`: the same corpus, the same
per-element provenance verdicts, the same match-by-`(tag, line)`. This pass adds
resolution on top and re-decides nothing. `--verify` reports the population it
selected against the committed row totals of the sibling directory.

Usage
-----
    python3 resolve.py --out results.json          # re-fetch corpus, resolve
    python3 resolve.py --recompute-from results.json   # offline, from rows
    python3 resolve.py --verify                    # population check only

Reads only the public npm registry, sends nothing, needs no credentials, writes
nothing outside its --out path. Standard library only.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import sys
import tarfile
from collections import Counter, defaultdict

_HERE = os.path.dirname(os.path.abspath(__file__))
_EVIDENCE = os.path.abspath(os.path.join(_HERE, "..", "a11y-evidence-record"))
_RECOVERY = os.path.abspath(os.path.join(_HERE, "..", "a11y-render-recovery"))
for _path in (_EVIDENCE, _RECOVERY):
    if _path not in sys.path:
        sys.path.insert(0, _path)

import audit  # noqa: E402
import classify  # noqa: E402
import measure_themes as themes  # noqa: E402

CORPUS_JSON = os.path.join(_EVIDENCE, "results-2026-08-20.json")
RECOVERY_JSON = os.path.join(_RECOVERY, "results-2026-08-20.json")

OUTCOMES = ("named", "unnamed", "placeholder", "merchant_deferred", "unresolved")

# Locale resources ship under a directory whose name says so. Restricting to the
# path (rather than sniffing every JSON in the package) keeps `content/faq.json`
# and `tsconfig.json` out of the translation table.
_LOCALE_DIR = re.compile(
    r"(?:^|/)(locales?|langs?|i18n|translations?|messages)/", re.I)
# Shopify ships schema-only strings in `*.schema.json` beside the storefront
# strings; those name admin form fields, never storefront controls.
_SCHEMA_LOCALE = re.compile(r"\.schema\.json$", re.I)
_SETTINGS_FILE = re.compile(r"settings_(schema|data)\.json$", re.I)
_SCHEMA_BLOCK = re.compile(r"\{%-?\s*schema\s*-?%\}(.*?)\{%-?\s*endschema\s*-?%\}",
                           re.S | re.I)

# A translation call with a *literal* key. Liquid puts the key first and the
# filter after (`'a.b' | t`); every other engine in the corpus calls a function.
_T_LIQUID = re.compile(r"""(['"])(?P<key>[^'"]+)\1\s*\|\s*t(?:ranslate)?\b""")
_T_CALL = re.compile(
    r"""(?:\$t|_\.dictionary|i18n|\bt)\s*\(\s*(['"])(?P<key>[^'"]+)\1""")
_T_MARK = classify._TRANSLATE
_LITERAL_VALUE = re.compile(r"""^\s*(['"])(?P<text>.*?)\1\s*(?:\|.*)?$""", re.S)
_SETTING = re.compile(
    r"^\s*(?:(?:section|block|blocks\[[^\]]*\])\.)?settings\.(?P<id>[\w-]+)")
# Theme-owned roots the *package* does not contain: the platform fills them per
# request. `settings`/`section`/`block` are excluded because those are exactly
# the ones the package's schema does answer.
RUNTIME_THEME_ROOTS = classify.THEME_ROOTS - {"settings", "section", "block",
                                              "blocks"}


# --- package resources ------------------------------------------------------

_IDX = classify._IDX
_WS = re.compile(r"\s+")


def raw_value(value: str | None, exprs: list[str]) -> str:
    """An attribute value with its expressions substituted back in, canonicalised.

    `classify.tokenize` replaces each expression with an indexed sentinel; this
    puts the text back so `id="{{ id_prefix }}FirstName"` can be compared with
    `for="{{id_prefix}}FirstName"`. Whitespace inside an expression is dropped
    so those two spellings compare equal -- they render identically, and the
    corpus contains both.
    """
    if not value:
        return ""
    return _IDX.sub(lambda m: _WS.sub("", exprs[int(m.group(1))]), value).strip()


def _flatten(value, prefix: str, out: dict) -> None:
    """Locale files are nested; the keys templates use are dotted paths."""
    if isinstance(value, dict):
        for key, child in value.items():
            _flatten(child, f"{prefix}.{key}" if prefix else str(key), out)
    elif isinstance(value, str):
        out[prefix] = value


def _collect_settings(value, out: dict) -> None:
    """Every schema entry that declares an id, mapped to its default.

    Walks the whole structure rather than assuming a shape: `settings_schema.json`
    is a list of sections each with `settings`, an inline `{% schema %}` block is
    an object with `settings` and `blocks[].settings`, and the corpus contains
    both plus a hand-rolled variant.
    """
    if isinstance(value, dict):
        ident = value.get("id")
        if isinstance(ident, str) and ident and (
                "type" in value or "default" in value or "label" in value):
            out.setdefault(ident, value.get("default"))
        for child in value.values():
            _collect_settings(child, out)
    elif isinstance(value, list):
        for child in value:
            _collect_settings(child, out)


class Resources:
    """Everything a build-time render of this theme would have, and nothing else."""

    def __init__(self) -> None:
        self.translations: dict[str, str] = {}
        self.settings: dict[str, object] = {}
        self.label_for: set[str] = set()
        # Raw (expression-preserving, whitespace-normalised) `for` values, keyed
        # to the file they were found in, so a same-file match can be told from
        # a cross-partial one.
        self.label_for_raw: dict[str, set[str]] = defaultdict(set)
        self.locale_files = 0
        self.settings_files = 0

    @property
    def has_translations(self) -> bool:
        return bool(self.translations)

    @property
    def has_settings(self) -> bool:
        return bool(self.settings)


def _read_member(archive: tarfile.TarFile, member: tarfile.TarInfo) -> str | None:
    try:
        handle = archive.extractfile(member)
        if handle is None:
            return None
        return handle.read().decode("utf-8", "ignore")
    except Exception:
        return None


def load_resources(blob: bytes, files: list[tuple[str, str]]) -> Resources:
    """Locale strings, settings defaults, and every literal `<label for>`."""
    res = Resources()
    try:
        archive = tarfile.open(fileobj=io.BytesIO(blob), mode="r:gz")
    except Exception:
        archive = None

    if archive is not None:
        for member in archive.getmembers():
            if not member.isfile() or member.size > 2_000_000:
                continue
            path = member.name
            if not path.endswith(".json"):
                continue
            is_locale = bool(_LOCALE_DIR.search(path)) and not _SCHEMA_LOCALE.search(path)
            is_settings = bool(_SETTINGS_FILE.search(path)) or (
                "settings_schema/" in path)
            if not (is_locale or is_settings):
                continue
            text = _read_member(archive, member)
            if text is None:
                continue
            try:
                data = json.loads(text)
            except Exception:
                continue
            if is_locale:
                res.locale_files += 1
                flat: dict[str, str] = {}
                _flatten(data, "", flat)
                for key, value in flat.items():
                    res.translations.setdefault(key, value)
            if is_settings:
                res.settings_files += 1
                _collect_settings(data, res.settings)

    for path, source in files:
        # `{% schema %}` blocks carry the defaults for section settings, which is
        # where storefront-visible headings and labels are actually declared.
        for match in _SCHEMA_BLOCK.finditer(source):
            try:
                _collect_settings(json.loads(match.group(1)), res.settings)
            except Exception:
                continue
        tokenized, exprs = classify.tokenize(source)
        tree = audit.Tree()
        tree.feed(tokenized)
        for node in tree.root.descendants():
            if node.tag != "label":
                continue
            target = node.attr("for")
            if not target:
                continue
            raw = raw_value(target, exprs)
            if raw:
                res.label_for_raw[path].add(raw)
            if not _IDX.search(target):
                res.label_for.add(raw)
    return res


# --- expression resolution --------------------------------------------------

def translation_key(body: str) -> str | None | bool:
    """The literal key of a translation call.

    Returns the key, `False` for a translation call whose key is not a literal
    (dynamic, and not resolvable from the package), or `None` if this is not a
    translation call at all.
    """
    for pattern in (_T_LIQUID, _T_CALL):
        match = pattern.search(body)
        if match:
            return match.group("key")
    if _T_MARK.search(body):
        return False
    return None


def literal_text(body: str) -> str | None:
    match = _LITERAL_VALUE.match(body.strip())
    return match.group("text") if match else None


def resolve_expr(expr: str, res: Resources) -> tuple[str, str]:
    """(outcome, reason) for one name-giving expression."""
    body, is_statement = classify._unwrap(expr)
    if is_statement or not body:
        return "unresolved", "statement"

    key = translation_key(body)
    if key is False:
        return "unresolved", "dynamic_translation_key"
    if key is not None:
        if not res.has_translations:
            return "unresolved", "no_locale_data"
        if key in res.translations:
            value = res.translations[key]
            if value.strip():
                return "named", "translation"
            return "unnamed", "empty_translation"
        # Liquid renders `Translation missing: en.a.b`; Vue i18n echoes the key.
        # Non-empty, so not a blocking failure -- but not a name either.
        return "placeholder", "missing_translation_key"

    text = literal_text(body)
    if text is not None:
        return ("named", "literal") if text.strip() else ("unnamed", "empty_literal")

    setting = _SETTING.match(body)
    if setting:
        if not res.has_settings:
            return "unresolved", "no_settings_schema"
        ident = setting.group("id")
        if ident in res.settings:
            default = res.settings[ident]
            if isinstance(default, str) and default.strip():
                return "named", "setting_default"
            if isinstance(default, (int, float)) and not isinstance(default, bool):
                return "named", "setting_default"
            return "merchant_deferred", "setting_empty_default"
        return "merchant_deferred", "setting_not_in_schema"

    root_match = re.match(r"\s*([A-Za-z_$][\w$]*)", body)
    root = root_match.group(1) if root_match else ""
    if root.lower() in RUNTIME_THEME_ROOTS:
        # `shop.name`, `routes.root_url`, `forloop.index`: theme-owned in the
        # sense that the shop owner does not type them, but supplied by the
        # platform at request time and absent from the package. Determinate on
        # a running store, not resolvable at build time from the tarball.
        return "unresolved", "runtime_theme_object"
    if classify._STRUCTURAL.search(root):
        return "placeholder", "structural_id_as_name"
    return "unresolved", "unmodelled_theme_root"


# Precedence when an element's name draws on several expressions. Any expression
# that renders a non-empty human string gives the element a name, so `named`
# wins; `unnamed` is claimed only when every expression resolved and all of them
# render empty, which is what makes it a defect claim rather than a guess.
_PRECEDENCE = ("named", "placeholder", "merchant_deferred", "unresolved", "unnamed")


def resolve_element(exprs: list[str], res: Resources) -> tuple[str, list[str]]:
    """(outcome, reasons) for an element whose name draws on `exprs`."""
    if not exprs:
        return "unresolved", ["no_expression"]
    results = [resolve_expr(expr, res) for expr in exprs]
    outcomes = {outcome for outcome, _ in results}
    for candidate in _PRECEDENCE:
        if candidate in outcomes:
            return candidate, [reason for outcome, reason in results
                               if outcome == candidate]
    return "unresolved", ["unclassified"]


# --- structural (cross-partial label) resolution ----------------------------

_PENDING = re.compile(r"no <label for=(['\"])(?P<id>.*?)\1>")


def pending_label_id(reason: str) -> str | None:
    match = _PENDING.search(reason)
    return match.group("id") if match else None


def resolve_structural(raw_id: str, path: str, res: Resources) -> tuple[str, str]:
    """Does a `<label for>` matching this control's rendered id exist anywhere?

    `raw_id` is the control's id with its expressions substituted back in, so
    the comparison is on the template text a render would evaluate.
    """
    if not raw_id:
        return "unresolved", "control_has_no_id"
    if raw_id in res.label_for_raw.get(path, ()):
        return "named", "label_same_file_expression_match"
    for other, values in res.label_for_raw.items():
        if other != path and raw_id in values:
            return "named", "label_other_partial_expression_match"
    if raw_id in res.label_for:
        return "named", "label_in_another_partial"
    return "unnamed", "no_label_anywhere_in_package"


# --- per-package pass -------------------------------------------------------

def resolve_package(name: str, version: str) -> dict:
    blob = themes.fetch(themes.tarball_url(name, version), timeout=120)
    files = themes.markup_from_tarball(blob)
    res = load_resources(blob, files)

    outcomes: Counter = Counter()
    reasons: Counter = Counter()
    by_check: dict[str, Counter] = defaultdict(Counter)
    by_bucket: dict[str, Counter] = defaultdict(Counter)
    in_scope = 0
    undecidable = 0
    structural_unmatched = 0
    defects: list[dict] = []

    for path, source in files:
        result = audit.audit_source(source, path)
        undecided = result["undecidable"]
        if not undecided:
            continue
        undecidable += len(undecided)
        tokenized, exprs = classify.tokenize(source)
        tree = audit.Tree()
        tree.feed(tokenized)
        bucket: dict[tuple, list] = defaultdict(list)
        for node in tree.root.descendants():
            bucket[(node.tag, node.line)].append(node)
        used: Counter = Counter()
        # Structural items are matched back to their node too (classify.py does
        # not need to), on their own counter so the non-structural indices stay
        # bit-for-bit identical to that pass.
        struct_used: Counter = Counter()

        for item in undecided:
            check = item["check"]
            if check == "control-no-label" and "partial" in item["reason"]:
                key = (item["element"], item["line"])
                index = struct_used[key]
                struct_used[key] += 1
                candidates = bucket.get(key, [])
                node = (candidates[index] if index < len(candidates)
                        else (candidates[-1] if candidates else None))
                if node is None:
                    structural_unmatched += 1
                raw_id = raw_value(node.attr("id"), exprs) if node is not None else ""
                outcome, reason = resolve_structural(raw_id, path, res)
                in_scope += 1
                outcomes[outcome] += 1
                reasons[reason] += 1
                by_check[check][outcome] += 1
                by_bucket["theme_structural"][outcome] += 1
                if outcome == "unnamed":
                    defects.append({"file": path, "line": item["line"],
                                    "element": item["element"], "check": check,
                                    "why": reason})
                continue

            key = (item["element"], item["line"])
            index = used[key]
            used[key] += 1
            candidates = bucket.get(key, [])
            node = (candidates[index] if index < len(candidates)
                    else (candidates[-1] if candidates else None))
            if node is None:
                continue
            found = list(dict.fromkeys(
                classify.exprs_in(node.attr("alt"), exprs)
                + classify._gather(node, exprs)))
            if classify.element_provenance(found) != "theme":
                continue                      # merchant / context: out of scope
            outcome, why = resolve_element(found, res)
            in_scope += 1
            outcomes[outcome] += 1
            reasons.update(why)
            by_check[check][outcome] += 1
            by_bucket["theme"][outcome] += 1
            if outcome == "unnamed":
                defects.append({"file": path, "line": item["line"],
                                "element": item["element"], "check": check,
                                "why": why[0] if why else ""})

    return {
        "package": name,
        "version": version,
        "undecidable": undecidable,
        "theme_recoverable": in_scope,
        "structural_unmatched": structural_unmatched,
        "outcomes": {k: outcomes.get(k, 0) for k in OUTCOMES if outcomes.get(k)},
        "by_bucket": {b: dict(c) for b, c in by_bucket.items()},
        "by_check": {c: dict(v) for c, v in by_check.items()},
        "reasons": dict(reasons.most_common()),
        "resources": {
            "locale_files": res.locale_files,
            "translation_keys": len(res.translations),
            "settings_files": res.settings_files,
            "settings_ids": len(res.settings),
            "label_for_ids": len(res.label_for),
        },
        "defect_examples": defects[:10],
        "defects": len(defects),
    }


def summarise(rows: list[dict]) -> dict:
    outcomes: Counter = Counter()
    reasons: Counter = Counter()
    by_check: dict[str, Counter] = defaultdict(Counter)
    by_bucket: dict[str, Counter] = defaultdict(Counter)
    in_scope = 0
    undecidable = 0
    unmatched = 0
    for row in rows:
        in_scope += row["theme_recoverable"]
        undecidable += row["undecidable"]
        unmatched += row.get("structural_unmatched", 0)
        outcomes.update(row["outcomes"])
        reasons.update(row["reasons"])
        for check, counts in row["by_check"].items():
            by_check[check].update(counts)
        for name, counts in row["by_bucket"].items():
            by_bucket[name].update(counts)

    scope = in_scope or 1
    settled = outcomes["named"] + outcomes["unnamed"] + outcomes["placeholder"]
    return {
        "packages": len(rows),
        "undecidable": undecidable,
        "theme_recoverable": in_scope,
        "structural_unmatched": unmatched,
        "outcomes": {k: outcomes.get(k, 0) for k in OUTCOMES},
        "shares_pct": {
            k: round(outcomes.get(k, 0) / scope * 100, 1) for k in OUTCOMES
        },
        "settled_pct": round(settled / scope * 100, 1),
        "defect_pct_of_theme_recoverable": round(
            outcomes["unnamed"] / scope * 100, 1),
        "by_bucket": {b: dict(c) for b, c in by_bucket.items()},
        "by_check": {c: dict(v) for c, v in
                     sorted(by_check.items(), key=lambda kv: -sum(kv[1].values()))},
        "reasons": dict(reasons.most_common()),
    }


def corpus_versions() -> list[tuple[str, str]]:
    with open(CORPUS_JSON) as handle:
        data = json.load(handle)
    return [(p["package"], p["version"]) for p in data["packages"]
            if p["undecidable"] > 0]


def recovery_expectation() -> dict[str, int]:
    """The sibling pass's theme-recoverable count, per package, for --verify."""
    with open(RECOVERY_JSON) as handle:
        data = json.load(handle)
    out = {}
    for row in data["packages"]:
        prov = row.get("provenance", {})
        out[row["package"]] = prov.get("theme", 0) + prov.get("theme_structural", 0)
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default=None)
    parser.add_argument("--recompute-from", default=None,
                        help="re-derive the summary from committed rows, offline")
    parser.add_argument("--verify", action="store_true",
                        help="check the selected population against a11y-render-recovery")
    args = parser.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as handle:
            data = json.load(handle)
        print(json.dumps(summarise(data["packages"]), indent=2))
        return 0

    rows = []
    for name, version in corpus_versions():
        row = resolve_package(name, version)
        rows.append(row)
        print(f"{name}@{version}: {row['theme_recoverable']} theme-recoverable, "
              f"{row['outcomes']}", flush=True)

    if args.verify:
        expected = recovery_expectation()
        bad = 0
        for row in rows:
            want = expected.get(row["package"])
            got = row["theme_recoverable"]
            flag = "" if want == got else "  <-- MISMATCH"
            if want != got:
                bad += 1
            print(f"{row['package']}: recovery={want} here={got}{flag}")
        print(f"\n{len(rows) - bad}/{len(rows)} packages match")
        return 0 if bad == 0 else 1

    summary = summarise(rows)
    print("\n=== summary ===")
    print(json.dumps(summary, indent=2))
    if args.out:
        with open(args.out, "w") as handle:
            json.dump({"summary": summary, "packages": rows}, handle, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
