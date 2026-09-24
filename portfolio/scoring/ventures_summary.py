#!/usr/bin/env python3
"""Every venture on one page, grouped by category and product type, ranked by viability.

    python3 portfolio/scoring/ventures_summary.py            # rewrite VENTURES_SUMMARY.md
    python3 portfolio/scoring/ventures_summary.py --stdout   # print instead

Nothing here is a new score. Viability is `venture-scores.yaml`'s composite
(the six-dimension mean), tie-broken by its floor, then by distribution and
time-to-revenue -- the two dimensions that decide whether a free tool reaches
anyone. A failed gate sinks a venture to the bottom whatever its mean, because
the scoring file records gates precisely so they cannot be averaged away.

Category and sub-category come from `platform/pages/build.mjs` (`categoryFor`,
`subcategoryFor`), imported through node rather than restated, so this page
groups exactly as the live catalogue does. Whether a venture is a browser tool
at all comes from the same file's `discoverSurfaces`.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
SCORES = ROOT / "portfolio" / "scoring" / "venture-scores.yaml"
VENTURES = ROOT / "ventures"
OUTPUT = ROOT / "portfolio" / "scoring" / "VENTURES_SUMMARY.md"

DIMENSIONS = (
    "ai_leverage",
    "autonomous_ops",
    "time_to_revenue",
    "gross_margin",
    "defensibility",
    "distribution",
)
SHORT = {
    "ai_leverage": "AI",
    "autonomous_ops": "Ops",
    "time_to_revenue": "TtR",
    "gross_margin": "GM",
    "defensibility": "Def",
    "distribution": "Dist",
}

# Product type, read from the slug's own wording. Order matters: first match wins.
TYPES = (
    ("Compliance & CI check", r"(check|checker|audit|auditor|preflight|readiness|ready|hygiene|drift)$"),
    ("Records, evidence & documents", r"(evidence|record|log|packet|generator|worksheet|sheet|tracker|planner|calendar|desk|workbench)$"),
    ("Monitoring & market intel", r"(watch|radar|intel|finder|markets)$"),
    ("Pricing, bid & margin calculator", r"(calculator|estimator|margin|pricing|quote|rate|even|payout|commission|compare|optimizer|variance|normalizer|impact|first|up)$"),
)
APP_TYPE = "Full app, CLI or device (not a static page)"
OTHER_TYPE = "Other browser tool"

NODE = r"""
import('./platform/pages/build.mjs').then(async (m) => {
  const surfaces = new Set((await m.discoverSurfaces('ventures')).map((s) => s.slug));
  const slugs = JSON.parse(process.argv[1]);
  const out = {};
  for (const slug of slugs) {
    const c = m.categoryFor(slug);
    const sub = m.subcategoryFor(slug);
    out[slug] = { category: c.title, categoryId: c.id, subcategory: sub ? sub.title : null, surface: surfaces.has(slug) };
  }
  const order = m.ALL_CATEGORIES.map((c) => c.title);
  process.stdout.write(JSON.stringify({ out, order }));
});
"""


def product_type(slug: str, surface: bool) -> str:
    if not surface:
        return APP_TYPE
    for name, pattern in TYPES:
        if re.search(pattern, slug):
            return name
    return OTHER_TYPE


def tier(composite: float, gate_failed: bool) -> str:
    if gate_failed:
        return "D"
    if composite >= 6.5:
        return "A"
    if composite >= 6.0:
        return "B"
    if composite >= 5.5:
        return "C"
    return "D"


def load() -> tuple[list[dict], list[str]]:
    scored = yaml.safe_load(SCORES.read_text())["ventures"]
    slugs = [v["slug"] for v in scored]
    result = subprocess.run(
        ["node", "-e", NODE, json.dumps(slugs)],
        cwd=ROOT, check=True, capture_output=True, text=True,
    )
    meta = json.loads(result.stdout)
    rows = []
    for v in scored:
        slug = v["slug"]
        m = meta["out"][slug]
        venture = yaml.safe_load((VENTURES / slug / "VENTURE.yaml").read_text())
        gates = v.get("gates") or {}
        gate_failed = any(value == "fail" for value in gates.values())
        s = v["scores"]
        rows.append({
            "slug": slug,
            "composite": float(v["composite"]),
            "floor": v["floor"],
            "floor_dimension": v["floor_dimension"],
            "scores": s,
            "gate_failed": gate_failed,
            "category": m["category"],
            "subcategory": m["subcategory"],
            "type": product_type(slug, m["surface"]),
            "stage": venture.get("stage"),
            "url": (venture.get("links") or {}).get("production"),
            "description": " ".join(str(venture.get("description") or "").split()),
        })
    rows.sort(key=lambda r: (
        r["gate_failed"],
        -r["composite"],
        -r["floor"],
        -r["scores"]["distribution"],
        -r["scores"]["time_to_revenue"],
        r["slug"],
    ))
    for rank, r in enumerate(rows, 1):
        r["rank"] = rank
        r["tier"] = tier(r["composite"], r["gate_failed"])
    return rows, meta["order"]


def blurb(text: str, limit: int = 140) -> str:
    text = text.replace("|", "/")
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:.") + "…"


def mean(values) -> float:
    values = list(values)
    return sum(values) / len(values) if values else 0.0


def render(rows: list[dict], order: list[str]) -> str:
    out: list[str] = []
    w = out.append
    tiers = defaultdict(int)
    for r in rows:
        tiers[r["tier"]] += 1

    w("# Ventures by viability")
    w("")
    w("Generated by `python3 portfolio/scoring/ventures_summary.py` -- do not edit by hand.")
    w("")
    w(f"**{len(rows)} ventures**, grouped by the catalogue's own categories and by product type,")
    w("each group ordered from most to least viable.")
    w("")
    w("**Viability** = the composite in [`venture-scores.yaml`](venture-scores.yaml): the mean of six")
    w("0-10 dimensions (AI leverage, autonomous ops, time to revenue, gross margin, defensibility,")
    w("distribution). Ties break on the floor (weakest dimension), then distribution, then time to")
    w("revenue. A failed liability/ethics gate ranks last regardless of the mean.")
    w("")
    w("> **Read these as upper bounds.** Every score is an agent estimate from repository evidence,")
    w("> not a customer measurement: no venture records revenue, and `portfolio/usage/usage.yaml`")
    w("> has no visitor reading for any of them (a `null`, never measured -- not a zero). The")
    w("> scoring file notes that every score anyone has since measured moved *down*.")
    w("")
    w("| Tier | Rule | Ventures |")
    w("|---|---|---:|")
    w(f"| A | composite ≥ 6.5 | {tiers['A']} |")
    w(f"| B | 6.0 – 6.49 | {tiers['B']} |")
    w(f"| C | 5.5 – 5.99 | {tiers['C']} |")
    w(f"| D | < 5.5, or a failed gate | {tiers['D']} |")
    w("")

    # --- category overview
    by_cat = defaultdict(list)
    for r in rows:
        by_cat[r["category"]].append(r)
    cat_order = sorted(
        by_cat,
        key=lambda c: (-mean(r["composite"] for r in by_cat[c]), order.index(c) if c in order else 99),
    )
    w("## Categories, most viable first")
    w("")
    w("| # | Category | Ventures | Mean | Best | Tier A | Mean Dist | Mean Def | Top venture |")
    w("|---:|---|---:|---:|---:|---:|---:|---:|---|")
    for i, c in enumerate(cat_order, 1):
        g = by_cat[c]
        w(
            f"| {i} | {c} | {len(g)} | {mean(r['composite'] for r in g):.2f} | "
            f"{max(r['composite'] for r in g):.2f} | {sum(r['tier'] == 'A' for r in g)} | "
            f"{mean(r['scores']['distribution'] for r in g):.1f} | "
            f"{mean(r['scores']['defensibility'] for r in g):.1f} | `{g[0]['slug']}` |"
        )
    w("")

    # --- type overview
    by_type = defaultdict(list)
    for r in rows:
        by_type[r["type"]].append(r)
    w("## Product types, most viable first")
    w("")
    w("Type is read from the slug's wording (`…-calculator`, `…-check`, `…-evidence`), except that")
    w("anything without a static browser page is filed as a full app, CLI or device.")
    w("")
    w("| # | Type | Ventures | Mean | Best | Tier A | Top venture |")
    w("|---:|---|---:|---:|---:|---:|---|")
    type_order = sorted(by_type, key=lambda t: -mean(r["composite"] for r in by_type[t]))
    for i, t in enumerate(type_order, 1):
        g = by_type[t]
        w(
            f"| {i} | {t} | {len(g)} | {mean(r['composite'] for r in g):.2f} | "
            f"{max(r['composite'] for r in g):.2f} | {sum(r['tier'] == 'A' for r in g)} | `{g[0]['slug']}` |"
        )
    w("")

    # --- category x type matrix
    w("## Category × type (count · mean composite)")
    w("")
    w("| Category | " + " | ".join(type_order) + " |")
    w("|---|" + "---:|" * len(type_order))
    for c in cat_order:
        cells = []
        for t in type_order:
            g = [r for r in by_cat[c] if r["type"] == t]
            cells.append(f"{len(g)} · {mean(r['composite'] for r in g):.2f}" if g else "–")
        w(f"| {c} | " + " | ".join(cells) + " |")
    w("")

    # --- top 25 overall
    w("## Top 25 overall")
    w("")
    w("| # | Venture | Composite | Floor | Category | Type |")
    w("|---:|---|---:|---|---|---|")
    for r in rows[:25]:
        w(
            f"| {r['rank']} | {link(r)} | {r['composite']:.2f} | {r['floor']} ({SHORT[r['floor_dimension']]}) | "
            f"{r['category']}{' / ' + r['subcategory'] if r['subcategory'] else ''} | {r['type']} |"
        )
    w("")

    # --- full listing
    w("## Every venture, by category and type")
    w("")
    w("Columns: overall rank, tier, composite, then the six scores "
      "(" + ", ".join(f"{SHORT[d]} = {d.replace('_', ' ')}" for d in DIMENSIONS) + ").")
    w("")
    for c in cat_order:
        g = by_cat[c]
        w(f"### {c} — {len(g)} ventures, mean {mean(r['composite'] for r in g):.2f}")
        w("")
        types_here = sorted({r["type"] for r in g}, key=lambda t: -mean(r["composite"] for r in g if r["type"] == t))
        for t in types_here:
            tg = [r for r in g if r["type"] == t]
            w(f"#### {t} ({len(tg)}, mean {mean(r['composite'] for r in tg):.2f})")
            w("")
            has_sub = any(r["subcategory"] for r in tg)
            head = "| # | Tier | Venture | Score | " + " | ".join(SHORT[d] for d in DIMENSIONS)
            head += (" | Sub-group" if has_sub else "") + " | What it is |"
            w(head)
            w("|---:|---|---|---:|" + "---:|" * len(DIMENSIONS) + ("---|" if has_sub else "") + "---|")
            for r in tg:
                flag = " ⚠ gate failed" if r["gate_failed"] else ""
                line = (
                    f"| {r['rank']} | {r['tier']} | {link(r)}{flag} | {r['composite']:.2f} | "
                    + " | ".join(str(r["scores"][d]) for d in DIMENSIONS)
                    + (f" | {r['subcategory'] or ''}" if has_sub else "")
                    + f" | {blurb(r['description'])} |"
                )
                w(line)
            w("")
    return "\n".join(out).rstrip() + "\n"


def link(r: dict) -> str:
    return f"[`{r['slug']}`]({r['url']})" if r["url"] else f"`{r['slug']}`"


def main(argv: list[str]) -> int:
    rows, order = load()
    text = render(rows, order)
    if "--stdout" in argv:
        sys.stdout.write(text)
    else:
        OUTPUT.write_text(text)
        print(f"wrote {OUTPUT.relative_to(ROOT)} ({len(rows)} ventures)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
