#!/usr/bin/env python3
"""Measures whether the 1.4.3 contrast port asked for in #523 is buildable.

Why this exists
----------------
`../../pipeline/probes/eaa-wcag-triage/` resolves colour contrast for *built*
HTML output (`.next/server/**/*.html` plus its linked, compiled stylesheet) by
parsing single-class and bare-type CSS selectors with a standard-library-only
`css.py`. #523 named porting that resolver into this directory's `audit.py` as
a follow-up, and flagged the answer as an open question rather than a small
extension, because this engine reads *source* storefront theme packages, not
built output: "the stylesheet is a separate file in the package and class
names are often built from expressions."

That sentence bundles two separate questions with two separate answers. This
script measures both, on the same 22-package corpus `measure_themes.py`
already audited (pinned to the same versions, from `results-2026-08-20.json`,
so the two measurements describe the same population).

Usage
-----
    python3 measure_stylesheet_reachability.py --out results.json
    python3 measure_stylesheet_reachability.py --recompute-from results.json

Reads only the public npm registry (already the corpus's registry per
`measure_themes.py`), sends nothing, needs no credentials. Standard library
only.
"""

from __future__ import annotations

import argparse
import io
import json
import re
import sys
import tarfile
import time
import urllib.parse
import urllib.request
from collections import Counter

NPM = "https://registry.npmjs.org"

# Exact corpus as audited in results-2026-08-20.json, for comparability.
PACKAGES = [
    ("@ecomplus/storefront-app", "2.0.0-beta.228"),
    ("@ecomplus/storefront-components", "1.0.0-beta.195"),
    ("@ecomplus/storefront-template", "2.0.0-beta.300"),
    ("@ecomplus/storefront-twbs", "7.3.6"),
    ("@fleetbase/storefront-engine", "0.4.19"),
    ("@mcptoolshop/site-theme", "2.1.0"),
    ("@molsoft/molsoft-tools", "3.1.1"),
    ("@nuskin/ns-shop-elements", "5.44.0"),
    ("@pradip1995/create-storefront-app", "0.6.19"),
    ("@vue-storefront/nuxt-theme", "2.8.0"),
    ("@vue-storefront/theme-default", "1.7.0"),
    ("@zalify/theme-templates", "0.5.0"),
    ("altify-shopify-pipeline", "0.4.4"),
    ("bootstrap-shopify-theme", "1.4.5"),
    ("create-brainerce-store", "1.67.0"),
    ("create-shopify-theme", "0.0.5"),
    ("fassbender-shopify-theme", "1.4.0"),
    ("gatsby-shopify-theme", "1.0.6"),
    ("pinelab-storefront", "1.4.3"),
    ("shopify-cms", "5.1.26"),
    ("shopify-theme-dev", "3.0.11"),
    ("shopify-typed-settings", "1.0.12"),
]

STYLESHEET_EXT = (".css", ".scss", ".sass", ".less")
MARKUP_EXT = (
    ".html", ".htm", ".liquid", ".hbs", ".handlebars", ".twig", ".ejs",
    ".njk", ".vue", ".php", ".svelte", ".mustache", ".volt", ".tpl",
)
SKIP_DIRS = {"node_modules", ".git", "dist", "vendor"}

# Signals that a .css file is not literal CSS a standard-library parser can
# resolve without running a preprocessor: Sass/Less source syntax that has
# leaked into a .css extension (rare but present via generated/checked-in
# source), or that the file plainly is not final output.
PREPROCESSOR_SIGNS = re.compile(
    r"^\s*\$[a-zA-Z_-]|^\s*@(mixin|include|import|if|else|each|for|while|function)\b|^\s*&[.:&]",
    re.MULTILINE,
)

CLASS_ATTR = re.compile(r'\bclass\s*=\s*"([^"]*)"')
EXPR_MARKERS = ("{{", "{%", "<?", "<%", "v-bind", ":class")


def fetch_json(url: str, timeout: int = 30):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read())


def fetch_bytes(url: str, timeout: int = 60) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return resp.read()


def tarball_url(name: str, version: str) -> str:
    meta = fetch_json(f"{NPM}/{urllib.parse.quote(name, safe='@/')}/{version}")
    return meta["dist"]["tarball"]


def measure_package(name: str, version: str) -> dict:
    url = tarball_url(name, version)
    data = fetch_bytes(url)
    tf = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")

    stylesheet_files = Counter()
    css_literal = 0
    css_needs_preprocessor = 0
    class_attrs_total = 0
    class_attrs_with_expr = 0
    markup_files = 0

    for member in tf.getmembers():
        if not member.isfile():
            continue
        parts = member.name.split("/")
        if any(p in SKIP_DIRS for p in parts):
            continue
        lower = member.name.lower()

        if lower.endswith(STYLESHEET_EXT):
            ext = "." + lower.rsplit(".", 1)[-1]
            stylesheet_files[ext] += 1
            if ext == ".css":
                try:
                    text = tf.extractfile(member).read().decode("utf-8", "ignore")
                except Exception:
                    continue
                if PREPROCESSOR_SIGNS.search(text):
                    css_needs_preprocessor += 1
                else:
                    css_literal += 1

        if lower.endswith(MARKUP_EXT):
            markup_files += 1
            try:
                text = tf.extractfile(member).read().decode("utf-8", "ignore")
            except Exception:
                continue
            for m in CLASS_ATTR.finditer(text):
                class_attrs_total += 1
                if any(marker in m.group(1) for marker in EXPR_MARKERS):
                    class_attrs_with_expr += 1

    return {
        "package": name,
        "version": version,
        "markup_files": markup_files,
        "stylesheet_files": dict(stylesheet_files),
        "css_literal": css_literal,
        "css_needs_preprocessor": css_needs_preprocessor,
        "class_attrs_total": class_attrs_total,
        "class_attrs_with_expr": class_attrs_with_expr,
        "has_any_stylesheet": sum(stylesheet_files.values()) > 0,
        "has_literal_css": css_literal > 0,
    }


def summarize(rows: list[dict]) -> dict:
    n = len(rows)
    with_any_stylesheet = sum(1 for r in rows if r["has_any_stylesheet"])
    with_literal_css = sum(1 for r in rows if r["has_literal_css"])
    ext_totals = Counter()
    for r in rows:
        for ext, count in r["stylesheet_files"].items():
            ext_totals[ext] += count
    total_css_files = ext_totals.get(".css", 0)
    total_css_literal = sum(r["css_literal"] for r in rows)
    total_css_needs_pre = sum(r["css_needs_preprocessor"] for r in rows)
    total_class_attrs = sum(r["class_attrs_total"] for r in rows)
    total_class_expr = sum(r["class_attrs_with_expr"] for r in rows)
    return {
        "packages": n,
        "packages_with_any_stylesheet_file": with_any_stylesheet,
        "packages_with_at_least_one_literal_css_file": with_literal_css,
        "stylesheet_file_extension_totals": dict(ext_totals),
        "css_files_total": total_css_files,
        "css_files_literal": total_css_literal,
        "css_files_needing_a_preprocessor": total_css_needs_pre,
        "class_attributes_total": total_class_attrs,
        "class_attributes_with_expression": total_class_expr,
        "class_attributes_expression_share_pct": (
            round(100 * total_class_expr / total_class_attrs, 1) if total_class_attrs else None
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--out")
    parser.add_argument("--recompute-from")
    parser.add_argument("--pause", type=float, default=0.3)
    args = parser.parse_args()

    if args.recompute_from:
        with open(args.recompute_from) as fh:
            data = json.load(fh)
        print(json.dumps(summarize(data["rows"]), indent=2))
        return 0

    rows = []
    for name, version in PACKAGES:
        try:
            rows.append(measure_package(name, version))
            print(f"  {name}@{version}: ok", file=sys.stderr)
        except Exception as exc:
            print(f"  {name}@{version}: FAILED {exc}", file=sys.stderr)
        time.sleep(args.pause)

    summary = summarize(rows)
    print(json.dumps(summary, indent=2))

    if args.out:
        with open(args.out, "w") as fh:
            json.dump({"summary": summary, "rows": rows}, fh, indent=1)
        print(f"\nwrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
