"""Turns a list of `scanner.Classification` results into the two artifacts
the candidate write-up promises: a human-readable report and an exportable
recovery manifest. Never recommends deletion outright -- `duplicate` and
`shared` are the only categories described as low-risk, and even those are
phrased as "content survives elsewhere", not "delete this".
"""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import datetime, timezone

from scanner import Classification, DUPLICATE, MOVED, PROTECTED, SHARED, UNCERTAIN, UNIQUE

_ACTION_BY_CATEGORY = {
    PROTECTED: "never eligible -- protected branch",
    SHARED: "review -- identical content lives under another ref name",
    DUPLICATE: "review -- content already reachable from another ref",
    MOVED: "needs-review -- new commits landed after the recorded snapshot",
    UNIQUE: "keep -- no other ref carries this work",
    UNCERTAIN: "needs-review -- classification inputs were incomplete",
}


def build_manifest(classifications: list[Classification], generated_at: str | None = None) -> dict:
    generated_at = generated_at or datetime.now(timezone.utc).isoformat()
    entries = []
    for c in classifications:
        entry = asdict(c)
        entry["recommended_action"] = _ACTION_BY_CATEGORY[c.category]
        entries.append(entry)

    by_category: dict[str, int] = {}
    for c in classifications:
        by_category[c.category] = by_category.get(c.category, 0) + 1

    total_unique_commits = sum(len(c.unique_commits) for c in classifications)

    return {
        "generated_at": generated_at,
        "counts_by_category": by_category,
        "refs": entries,
        "notes": [
            "Read-only: no ref was deleted, moved, or written to produce this report.",
            "`duplicate` and `shared` mean the commits are reachable from another "
            "live ref today, not that they are safe to delete after this ref is "
            "gone -- re-check immediately before any deletion, since a live ref "
            "can move between the scan and the action.",
            f"{total_unique_commits} commit(s) across {by_category.get(UNIQUE, 0) + by_category.get(MOVED, 0)} "
            "ref(s) exist only on that ref and are listed individually below so "
            "they can be cherry-picked or preserved before any cleanup.",
        ],
    }


def render_markdown(manifest: dict) -> str:
    lines = [
        "# Branch hygiene report",
        "",
        f"Generated {manifest['generated_at']}.",
        "",
        "| Category | Count |",
        "|---|---:|",
    ]
    for category in (PROTECTED, SHARED, DUPLICATE, MOVED, UNIQUE, UNCERTAIN):
        count = manifest["counts_by_category"].get(category, 0)
        if count:
            lines.append(f"| `{category}` | {count} |")

    lines += ["", "## Refs", ""]
    for entry in manifest["refs"]:
        lines.append(f"### `{entry['ref']}` ({entry['origin']}) -- `{entry['category']}`")
        lines.append("")
        lines.append(f"- tip: `{entry['sha']}`")
        lines.append(f"- reason: {entry['reason']}")
        lines.append(f"- recommended action: {entry['recommended_action']}")
        if entry["duplicate_of"]:
            lines.append(f"- duplicate of: `{entry['duplicate_of']}`")
        if entry["shared_with"]:
            lines.append(f"- shared with: {', '.join(f'`{n}`' for n in entry['shared_with'])}")
        if entry["recorded_tip"]:
            lines.append(f"- recorded snapshot tip: `{entry['recorded_tip']}`")
        if entry["also_at"]:
            lines.append(f"- same tip also at: {', '.join(f'`{o}`' for o in entry['also_at'])}")
        if entry["diverged_copies"]:
            lines.append(
                "- **copies at a different tip**: "
                + ", ".join(f"`{c}`" for c in entry["diverged_copies"])
                + " -- unpushed or force-pushed work; the tip above is not the whole story"
            )
        if entry["unique_commits"]:
            lines.append(f"- unique commits ({len(entry['unique_commits'])}), for recovery:")
            for sha in entry["unique_commits"]:
                lines.append(f"  - `{sha}`")
        lines.append("")

    for note in manifest["notes"]:
        lines.append(f"> {note}")
    lines.append("")
    return "\n".join(lines)


def write_report(classifications: list[Classification], out_json, out_md, generated_at: str | None = None) -> dict:
    manifest = build_manifest(classifications, generated_at=generated_at)
    out_json.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    out_md.write_text(render_markdown(manifest), encoding="utf-8")
    return manifest
