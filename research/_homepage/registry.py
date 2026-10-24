"""Read the research project registry: projects.json plus per-project cards.

A project can declare its own card in research/<slug>/project.json, so adding a
project touches only its own directory instead of the shared projects.json
(which most concurrent research PRs would otherwise conflict on):

    {"theme": "scoring", "title": "Question the project answers?", "summary": "Abstract (HTML).",
     "lede": "One-line summary for research/README.md."}

The lede becomes the project's bullet in research/README.md, generated between the
`<!-- projects:start -->` markers by platform/ci/research_live_links.py --write.

Projects listed in projects.json keep their place; per-project cards are
appended to their theme, sorted by slug. A slug in both is reported by
`registry_errors`. platform/pages/research-registry.mjs mirrors this merge.
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def load(research=None):
    """projects.json as a dict, with every research/<slug>/project.json card merged in."""
    research = Path(research) if research else HERE.parent
    data = json.loads((research / "_homepage" / "projects.json").read_text())
    themes = {t.get("id"): t for t in data["themes"]}
    listed = {p["slug"] for t in data["themes"] for p in t["projects"]}
    data["registry_errors"] = errors = []
    for f in sorted(research.glob("*/project.json")):
        slug = f.parent.name
        if slug[0] in "_.":
            continue
        try:
            card = json.loads(f.read_text())
        except ValueError as e:
            errors.append(f"research/{slug}/project.json: not valid JSON ({e})")
            continue
        if slug in listed:
            errors.append(f"research/{slug}: listed in both projects.json and its project.json")
        elif card.get("theme") not in themes:
            errors.append(f"research/{slug}/project.json: theme {card.get('theme')!r} is not a theme id in projects.json")
        else:
            themes[card["theme"]]["projects"].append(
                {"slug": slug, "title": card.get("title", ""), "summary": card.get("summary", ""),
                 "lede": card.get("lede", "")})
    return data
