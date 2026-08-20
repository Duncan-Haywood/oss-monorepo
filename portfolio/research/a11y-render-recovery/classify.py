#!/usr/bin/env python3
"""Classify each *undecidable* audit result by the data it is waiting on.

Why this exists
---------------
`portfolio/research/a11y-evidence-record/` measured that 63% of what a static
template audit touches is **undecidable** -- `alt="{{ image.alt }}"` has an alt
attribute whose value is unknown until something renders it. That directory's
own "What could not be measured here" section names the gap this file closes:

    "No rendered-page comparison. The 70.4% undecidable share is measured, but
     what a rendered audit would recover from it is inferred, not measured."

The honest way to answer "what would rendering recover" without inventing a
render context is to ask, of each undecidable expression, *whose data fills it*:

  - **theme** -- the value is set by the theme/developer and is the same for
    every store that installs the theme: a translation string (`{{ 'x' | t }}`,
    `{{ $t('x') }}`), a theme setting (`section.settings.title`), a hardcoded
    literal, or a structural id (`{{ section.id }}`). Rendering recovers these
    to a determinate result *at build time, once per theme, with no store data*.
    This is the automatable / free-qualification share.
  - **merchant** -- the value is content the shop owner typed: `product.title`,
    `image.alt`, `collection.title`. Rendering recovers these only against the
    specific store, and an empty one (a merchant who left alt text blank) is a
    *real blocking failure* that exists at that store and nowhere else. This is
    where the residual accessibility risk actually lives, and a template-only
    audit cannot settle it for a shop it has not seen.
  - **context** -- the name comes from a bare local (`title`, `child.url`,
    `<%= slug %>`) whose binding is in loop or controller code, not the
    template. The template alone cannot say whose data this is; resolving it
    needs the rendered page or the controller. This share is a lower bound on
    "you must render", because it is undecidable *even as to provenance*.

The split refines `a11y-evidence-record` finding 2 ("rendering closes almost all
of it -- a build step, not a hire"). Rendering closes the **theme** share as a
build step; the **merchant** share is not closed by building -- it is closed
only by a particular store's data -- and the **context** share cannot even be
attributed from the template.

Faithfulness
------------
The set of undecidables is taken verbatim from `audit.audit_source`, so this
script classifies exactly the population that directory measured -- it does not
re-decide what is undecidable. Each undecidable is matched back to its element
in a parallel parse that preserves the raw `{{ ... }}` / `<%= ... %>` text
(which `audit.py` strips to a sentinel), by `(tag, line)`; both parses collapse
multi-line expressions identically, so the line numbers line up. `--verify`
reports the match rate; on the committed corpus it is 100%.

Corpus and limits
-----------------
The same 22 npm storefront-theme packages `a11y-evidence-record` measured,
pinned by version so this classifies the identical 491 undecidables. npm is the
reachable-but-wrong shelf (the themes EU shops actually run are on the Shopify
and WordPress stores, which this environment's egress policy blocks) -- so the
*mix* of theme/merchant/context here is a fact about these packages, not a
market estimate. What generalises is the mechanism: that "what rendering
recovers" is not one thing but three, only one of which a free template audit
can bank.

Usage
-----
    python3 classify.py --out results.json      # re-fetch corpus, classify
    python3 classify.py --recompute-from results.json   # offline, from rows
    python3 classify.py --verify                # match-rate audit only

Reads only the public npm registry, sends nothing, needs no credentials, writes
nothing outside its --out path. Standard library only; imports the sibling
`audit.py` for the authoritative undecidable decision and its parser.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict

# The audit pass and the npm corpus fetcher both live in the sibling directory.
_SIB = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                    "..", "a11y-evidence-record")
sys.path.insert(0, os.path.abspath(_SIB))
import audit  # noqa: E402
import measure_themes as themes  # noqa: E402

CORPUS_JSON = os.path.join(_SIB, "results-2026-08-20.json")

# --- expression-preserving tokenizer ---------------------------------------
# audit.strip_expressions() replaces every template expression with one fixed
# sentinel, discarding the text. We replace each with an *indexed* sentinel and
# keep the raw text, so a matched node's deciding expression can be read back.
# The sentinel carries no newline, exactly as audit's does, so both parses shift
# subsequent line numbers by the same amount and (tag, line) stays a valid key.
_IDX = re.compile("\x00e(\\d+)x\x00")


def tokenize(raw: str) -> tuple[str, list[str]]:
    exprs: list[str] = []

    def replace(match: re.Match) -> str:
        exprs.append(match.group(0))
        return "\x00e%dx\x00" % (len(exprs) - 1)

    text = raw
    for pattern in audit.EXPR_SYNTAX:
        text = pattern.sub(replace, text)
    return text, exprs


def exprs_in(value: str | None, exprs: list[str]) -> list[str]:
    if not value:
        return []
    return [exprs[int(i)] for i in _IDX.findall(value)]


# --- provenance taxonomy ----------------------------------------------------
# Roots are matched conservatively: an expression is called "theme" only when it
# is unambiguously theme/developer-controlled, because over-calling theme would
# inflate the "recoverable for free" share -- the optimistic direction. Anything
# whose owner is not clear from the template is "context", not "theme".

MERCHANT_ROOTS = {
    "product", "products", "collection", "collections", "variant", "variants",
    "line_item", "line_items", "image", "images", "featured_image", "media",
    "article", "articles", "blog", "blogs", "page", "pages", "cart", "customer",
    "order", "orders", "address", "addresses", "metafield", "metafields",
    "review", "reviews", "vendor", "gift_card", "current_variant",
    "selected_variant", "comment", "brand", "manufacturer",
    # `category` / `subcategory` deliberately not listed: in the corpus they
    # appear as EJS loop variables (`_.each(categories, function(subcategory)`),
    # so the root does not identify a merchant object, only a loop-scoped one.
}
THEME_ROOTS = {
    "settings", "section", "block", "blocks", "theme", "template", "request",
    "routes", "canonical_url", "forloop", "tablerow", "localization", "form",
    "shop", "linklists", "link", "links", "menu", "handle", "paginate",
    "predictive_search", "content_for_header", "content_for_layout",
    "powered_by_link", "additional_checkout_buttons", "scripts", "currency",
    "locale", "logo", "contacts", "social", "footer", "header", "nav",
    "navigation", "country_option_tags", "all_country_option_tags",
}
# Translation / i18n helpers across the template engines in the corpus (Liquid
# `| t`, Vue `$t(...)`, ecomplus `_.dictionary(...)`, generic `i18n(...)`).
_TRANSLATE = re.compile(
    r"\|\s*t(?:ranslate)?\b"        # Liquid / Twig filter
    r"|\$t\s*\("                    # Vue i18n
    r"|\b_\.dictionary\s*\("        # ecomplus
    r"|\bi18n\s*\(",                # generic
)
# Structural, developer-set identifiers (used mainly in the id position, where an
# expression blocks static <label for> matching but renders to a theme-fixed id).
# Matches both snake_case (`product_form_id`, `section_id`) and camelCase
# (`idPrefix`, `formId`) suffixes -- the corpus has both.
_STRUCTURAL = re.compile(
    r"(?:^|_|(?<=[a-z]))(Id|Prefix|Index|Uid|Key|Section"
    r"|id|prefix|index|uid|key|section)$"
)
_LITERAL = re.compile(r"""^\s*['"]""")


def _unwrap(expr: str) -> tuple[str | None, bool]:
    """Return (body, is_statement). Statements ({% %}, <% %>, <?php ?>) gate
    *presence* rather than supply a value, so their body is not a data root."""
    e = expr.strip()
    for open_, close, stmt in (
        ("{{", "}}", False), ("{%", "%}", True),
        ("<%=", "%>", False), ("<%", "%>", True),
        ("<?=", "?>", False), ("<?php", "?>", True), ("<?", "?>", True),
    ):
        if e.startswith(open_):
            inner = e[len(open_):]
            if inner.endswith(close):
                inner = inner[:-len(close)]
            return inner.strip(), stmt
    return e, False


def classify_expr(expr: str) -> str:
    body, is_stmt = _unwrap(expr)
    if is_stmt or body is None:
        return "context"          # conditional/loop control -> presence, not data
    if _TRANSLATE.search(body):
        return "theme"
    if _LITERAL.match(body):
        return "theme"            # hardcoded string the developer wrote
    root_match = re.match(r"\s*([A-Za-z_$][\w$]*)", body)
    if not root_match:
        return "context"
    root = root_match.group(1)
    low = root.lower()
    if low in MERCHANT_ROOTS:
        return "merchant"
    if low in THEME_ROOTS:
        return "theme"
    if _STRUCTURAL.search(root):
        return "theme"            # e.g. section_id, idPrefix, product_form_id
    return "context"              # bare local: binding lives outside the template


def element_provenance(found: list[str]) -> str:
    """One verdict for an element whose accessible name draws on `found`.

    Merchant wins: if any name-giving expression reads merchant data, the
    rendered name is per-store regardless of what else is present. Theme only
    when every expression is unambiguously theme. Otherwise context."""
    if not found:
        return "context"
    classes = [classify_expr(e) for e in found]
    if "merchant" in classes:
        return "merchant"
    if all(c == "theme" for c in classes):
        return "theme"
    return "context"


def _gather(node, exprs: list[str]) -> list[str]:
    """Every raw expression in an element's name-giving surface: its own text,
    its attributes, and the same for descendants (an inner <img alt> or nested
    span can supply a link/button its accessible name)."""
    out: list[str] = []
    for part in node.text_parts:
        out += exprs_in(part, exprs)
    for value in node.attrs.values():
        out += exprs_in(value, exprs)
    for child in node.children:
        out += _gather(child, exprs)
    return out


# --- per-package classification ---------------------------------------------
# Buckets. "theme_structural" is the partial-assembly mechanism: a control whose
# <label for> is simply in another partial of the same page. Rendering assembles
# the page and recovers it; it needs no store data, so it is theme-recoverable,
# but it is not an expression, so it is tracked as its own mechanism.
PROVENANCE = ("theme", "theme_structural", "merchant", "context")


def classify_package(name: str, version: str, pause: float = 0.15) -> dict | None:
    blob = themes.fetch(themes.tarball_url(name, version), timeout=120)
    files = themes.markup_from_tarball(blob)
    prov: Counter = Counter()
    by_check: dict[str, Counter] = defaultdict(Counter)
    total = 0
    matched = 0

    for path, source in files:
        result = audit.audit_source(source, path)
        undecided = result["undecidable"]
        if not undecided:
            continue
        tokenized, exprs = tokenize(source)
        tree = audit.Tree()
        tree.feed(tokenized)
        nodes = list(tree.root.descendants())
        bucket: dict[tuple, list] = defaultdict(list)
        for node in nodes:
            bucket[(node.tag, node.line)].append(node)
        used: Counter = Counter()

        for item in undecided:
            total += 1
            # Partial-assembly: the label may live in another file. Structural,
            # theme-owned, and not an expression.
            if item["check"] == "control-no-label" and "partial" in item["reason"]:
                prov["theme_structural"] += 1
                by_check[item["check"]]["theme_structural"] += 1
                matched += 1
                continue
            key = (item["element"], item["line"])
            index = used[key]
            used[key] += 1
            candidates = bucket.get(key, [])
            node = (candidates[index] if index < len(candidates)
                    else (candidates[-1] if candidates else None))
            if node is None:
                continue                      # unmatched; counted via matched<total
            matched += 1
            found = list(dict.fromkeys(
                exprs_in(node.attr("alt"), exprs) + _gather(node, exprs)))
            verdict = element_provenance(found)
            prov[verdict] += 1
            by_check[item["check"]][verdict] += 1

    return {
        "package": name,
        "version": version,
        "undecidable": total,
        "matched": matched,
        "provenance": {k: prov.get(k, 0) for k in PROVENANCE if prov.get(k)},
        "by_check": {c: dict(v) for c, v in by_check.items()},
    }


def summarise(rows: list[dict]) -> dict:
    prov: Counter = Counter()
    by_check: dict[str, Counter] = defaultdict(Counter)
    total = 0
    matched = 0
    for row in rows:
        total += row["undecidable"]
        matched += row["matched"]
        prov.update(row["provenance"])
        for check, counts in row["by_check"].items():
            by_check[check].update(counts)

    theme_recoverable = prov["theme"] + prov["theme_structural"]
    decided = total or 1
    return {
        "packages": len(rows),
        "undecidable": total,
        "matched": matched,
        "match_rate_pct": round(matched / decided * 100, 1),
        "provenance": {k: prov.get(k, 0) for k in PROVENANCE},
        "shares_pct": {
            "theme_recoverable": round(theme_recoverable / decided * 100, 1),
            "merchant_per_store": round(prov["merchant"] / decided * 100, 1),
            "context_dependent": round(prov["context"] / decided * 100, 1),
        },
        "by_check": {c: dict(v) for c, v in
                     sorted(by_check.items(), key=lambda kv: -sum(kv[1].values()))},
    }


def corpus_versions() -> list[tuple[str, str]]:
    with open(CORPUS_JSON) as handle:
        data = json.load(handle)
    return [(p["package"], p["version"]) for p in data["packages"]
            if p["undecidable"] > 0]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out", default=None)
    parser.add_argument("--recompute-from", default=None,
                        help="re-derive the summary from committed rows, offline")
    parser.add_argument("--verify", action="store_true",
                        help="print only the (tag, line) match rate")
    args = parser.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as handle:
            data = json.load(handle)
        print(json.dumps(summarise(data["packages"]), indent=2))
        return 0

    rows = []
    for name, version in corpus_versions():
        row = classify_package(name, version)
        if row:
            rows.append(row)
            print(f"{name}@{version}: {row['undecidable']} undecidable, "
                  f"{row['matched']} matched, {row['provenance']}", flush=True)

    summary = summarise(rows)
    if args.verify:
        print(f"\nmatched {summary['matched']}/{summary['undecidable']} "
              f"= {summary['match_rate_pct']}%")
        return 0 if summary["matched"] == summary["undecidable"] else 1

    print("\n=== summary ===")
    print(json.dumps(summary, indent=2))
    if args.out:
        with open(args.out, "w") as handle:
            json.dump({"summary": summary, "packages": rows}, handle, indent=1)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
