"""Standalone culling: a folder of stills in, a keeper per burst and a report out.

``shootflow cull FOLDER`` reads the photos (JPEG, PNG, TIFF and the preview
embedded in RAW files), scores each with the measured frame metrics, groups
near-identical frames by perceptual hash (single linkage, the same distance the
story planner uses), and picks one keeper per group. It also flags frames that
fail on their own: blurred, badly exposed, or with a prominent closed eye when a
face detector is configured (``SHOOTFLOW_FACE_DETECTOR``, see ``faces.py``).

Safety rules, matching the rest of ShootFlow: photos are only read. Output is a
``cull_report.json`` and ``cull_report.html`` in a folder you name, and, with
``write_xmp``, a Lightroom/Bridge ``.xmp`` sidecar per photo. An existing sidecar
is never touched (it holds the photographer's edits); it is listed as skipped.

The scores are technical signals, not taste. A keeper is the sharpest, best
exposed, best framed frame of its group, not necessarily the best expression
(that needs the face detector). Nothing here has been checked against a
photographer's real picks yet; the report says so.
"""

from __future__ import annotations

import html
import json
import re
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path

from shootflow.faces import FaceReport, detect_faces
from shootflow.ffmpeg_media import PHOTO_EXTENSIONS, FfmpegMediaError, FfmpegTools, find_ffmpeg_tools
from shootflow.frame_analysis import FrameMetrics, analyze_media, hamming_distance
from shootflow.raw_preview import RAW_EXTENSIONS

NEAR_DUPLICATE_MAX_DISTANCE = 8
BLURRY_BELOW = 0.2
BAD_EXPOSURE_BELOW = 0.25
CLOSED_EYES_BELOW = 0.3
_MAX_FILES = 20000
_SIDECAR_RATING = {"keeper": 4, "alternate": 2, "reject": -1}
_SAFE_NAME = re.compile(r"[^\x20-\x7e]")

Analyzer = Callable[[Path], tuple[FrameMetrics, FaceReport | None]]


class CullError(ValueError):
    """Raised when the folder cannot be culled."""


@dataclass(frozen=True)
class CullItem:
    path: str
    group: int
    role: str  # keeper | alternate | reject
    score: float
    reasons: tuple[str, ...]
    sharpness: float
    exposure: float
    eyes_open: float | None
    dhash: str


@dataclass(frozen=True)
class CullResult:
    folder: str
    items: tuple[CullItem, ...]
    unreadable: tuple[tuple[str, str], ...]
    sidecars_written: tuple[str, ...]
    sidecars_skipped: tuple[str, ...]

    @property
    def group_count(self) -> int:
        return len({item.group for item in self.items})

    def count(self, role: str) -> int:
        return sum(1 for item in self.items if item.role == role)


def scan_photos(folder: Path, *, recursive: bool = False) -> list[Path]:
    if not folder.is_dir():
        raise CullError(f"not a folder: {folder}")
    suffixes = PHOTO_EXTENSIONS | RAW_EXTENSIONS
    pattern = "**/*" if recursive else "*"
    found = sorted(
        path
        for path in folder.glob(pattern)
        if path.is_file() and not path.is_symlink() and path.suffix.lower() in suffixes
        and not path.name.startswith(".")
    )
    if len(found) > _MAX_FILES:
        raise CullError(f"{len(found)} photos is over the {_MAX_FILES} limit; cull a sub-folder")
    return found


def default_analyzer(tools: FfmpegTools) -> Analyzer:
    def analyze(path: Path) -> tuple[FrameMetrics, FaceReport | None]:
        return analyze_media(tools, path, media_type="photo"), detect_faces(path)

    return analyze


def cull_folder(
    folder: Path | str,
    *,
    recursive: bool = False,
    analyzer: Analyzer | None = None,
) -> CullResult:
    root = Path(folder)
    photos = scan_photos(root, recursive=recursive)
    if not photos:
        raise CullError(f"no photos found in {root}")
    analyze = analyzer or default_analyzer(find_ffmpeg_tools())
    scored: list[tuple[Path, FrameMetrics, FaceReport | None]] = []
    unreadable: list[tuple[str, str]] = []
    for path in photos:
        try:
            metrics, faces = analyze(path)
        except (FfmpegMediaError, OSError) as exc:
            unreadable.append((_rel(path, root), str(exc)[:200]))
            continue
        scored.append((path, metrics, faces))
    groups = _group(scored)
    items: list[CullItem] = []
    for number, members in enumerate(groups, start=1):
        ranked = sorted(members, key=lambda m: (-_score(m[1], m[2]), str(m[0])))
        keeper_taken = False
        for path, metrics, faces in ranked:
            reasons = _failures(metrics, faces)
            if reasons:
                role = "reject"
            elif not keeper_taken:
                role, keeper_taken = "keeper", True
            else:
                role = "alternate"
            items.append(
                CullItem(
                    path=_rel(path, root),
                    group=number,
                    role=role,
                    score=round(_score(metrics, faces), 4),
                    reasons=reasons,
                    sharpness=round(metrics.sharpness, 4),
                    exposure=round(metrics.exposure, 4),
                    eyes_open=faces.worst_eyes_open if faces else None,
                    dhash=metrics.dhash,
                )
            )
    items.sort(key=lambda item: (item.group, item.path))
    return CullResult(str(root), tuple(items), tuple(unreadable), (), ())


def _score(metrics: FrameMetrics, faces: FaceReport | None) -> float:
    # Culling leans on technical quality more than the story planner does.
    base = 0.6 * metrics.technical_score + 0.4 * metrics.story_score
    return base + (faces.story_adjustment if faces else 0.0)


def _failures(metrics: FrameMetrics, faces: FaceReport | None) -> tuple[str, ...]:
    reasons: list[str] = []
    if metrics.sharpness < BLURRY_BELOW:
        reasons.append("blurry")
    if metrics.exposure < BAD_EXPOSURE_BELOW:
        reasons.append("bad exposure")
    if faces and faces.worst_eyes_open is not None and faces.worst_eyes_open < CLOSED_EYES_BELOW:
        reasons.append("closed eyes")
    return tuple(reasons)


def _group(
    scored: Sequence[tuple[Path, FrameMetrics, FaceReport | None]],
) -> list[list[tuple[Path, FrameMetrics, FaceReport | None]]]:
    ordered = sorted(scored, key=lambda row: str(row[0]))
    parent = list(range(len(ordered)))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    for i in range(len(ordered)):
        for j in range(i + 1, len(ordered)):
            if hamming_distance(ordered[i][1].dhash, ordered[j][1].dhash) <= NEAR_DUPLICATE_MAX_DISTANCE:
                a, b = find(i), find(j)
                if a != b:
                    parent[max(a, b)] = min(a, b)
    grouped: dict[int, list[tuple[Path, FrameMetrics, FaceReport | None]]] = {}
    for index, row in enumerate(ordered):
        grouped.setdefault(find(index), []).append(row)
    return [grouped[key] for key in sorted(grouped)]


def _rel(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def xmp_sidecar(item: CullItem) -> str:
    rating = _SIDECAR_RATING[item.role]
    label = {"keeper": "Green", "reject": "Red"}.get(item.role)
    label_attr = f' xmp:Label="{label}"' if label else ""
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        '  <rdf:Description rdf:about="" xmlns:xmp="http://ns.adobe.com/xap/1.0/"'
        f' xmp:Rating="{rating}"{label_attr}/>\n'
        " </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>\n"
    )


def write_sidecars(result: CullResult) -> CullResult:
    """Write ``photo.xmp`` beside each photo; never replace one that exists."""

    root = Path(result.folder)
    written: list[str] = []
    skipped: list[str] = []
    for item in result.items:
        sidecar = (root / item.path).with_suffix(".xmp")
        if sidecar.exists() or sidecar.is_symlink():
            skipped.append(sidecar.relative_to(root).as_posix())
            continue
        try:
            with sidecar.open("x", encoding="utf-8") as handle:
                handle.write(xmp_sidecar(item))
        except FileExistsError:
            skipped.append(sidecar.relative_to(root).as_posix())
            continue
        written.append(sidecar.relative_to(root).as_posix())
    return CullResult(result.folder, result.items, result.unreadable, tuple(written), tuple(skipped))


@dataclass(frozen=True)
class PickScore:
    """How the cull compares with a photographer's own picks."""

    picks: int
    matched: int
    unmatched: tuple[str, ...]
    groups_with_a_pick: int
    keeper_hits: int  # groups with a pick whose keeper is one of the picks
    picks_rejected: tuple[str, ...]  # the costly miss: a frame you wanted, flagged reject
    picks_kept: int  # picks the cull left as keeper or alternate

    @property
    def keeper_hit_rate(self) -> float | None:
        return self.keeper_hits / self.groups_with_a_pick if self.groups_with_a_pick else None

    @property
    def false_reject_rate(self) -> float | None:
        return len(self.picks_rejected) / self.matched if self.matched else None


def read_picks(path: Path | str) -> list[str]:
    """One file name or relative path per line; blank lines and ``#`` comments are ignored."""

    lines = Path(path).read_text(encoding="utf-8").splitlines()
    return [line.strip() for line in lines if line.strip() and not line.strip().startswith("#")]


def score_against_picks(result: CullResult, picks: Sequence[str]) -> PickScore:
    """Match picks to photos by relative path, else by file name or stem (case-insensitive)."""

    by_path = {i.path.lower(): i for i in result.items}
    by_name: dict[str, list[CullItem]] = {}
    for item in result.items:
        name = item.path.lower().rsplit("/", 1)[-1]
        by_name.setdefault(name, []).append(item)
        by_name.setdefault(name.rsplit(".", 1)[0], []).append(item)
    matched: dict[str, CullItem] = {}
    unmatched: list[str] = []
    for pick in picks:
        key = pick.replace("\\", "/").lstrip("./").lower()
        item = by_path.get(key)
        if item is None:
            candidates = by_name.get(key.rsplit("/", 1)[-1], [])
            item = candidates[0] if len(candidates) == 1 else None  # ambiguous names do not match
        if item is None:
            unmatched.append(pick)
        else:
            matched[item.path] = item
    picked_groups = {item.group for item in matched.values()}
    keepers = {i.group: i.path for i in result.items if i.role == "keeper"}
    hits = sum(1 for g in picked_groups if keepers.get(g) in matched)
    rejected = tuple(sorted(p for p, i in matched.items() if i.role == "reject"))
    return PickScore(
        picks=len(picks), matched=len(matched), unmatched=tuple(unmatched),
        groups_with_a_pick=len(picked_groups), keeper_hits=hits, picks_rejected=rejected,
        picks_kept=len(matched) - len(rejected),
    )


def pick_score_to_dict(score: PickScore) -> dict[str, object]:
    return {
        "picks": score.picks, "matched": score.matched, "unmatched": list(score.unmatched),
        "groups_with_a_pick": score.groups_with_a_pick, "keeper_hits": score.keeper_hits,
        "keeper_hit_rate": score.keeper_hit_rate, "picks_rejected": list(score.picks_rejected),
        "false_reject_rate": score.false_reject_rate, "picks_kept": score.picks_kept,
    }


def result_to_dict(result: CullResult, score: PickScore | None = None) -> dict[str, object]:
    return {
        **({"against_your_picks": pick_score_to_dict(score)} if score else {}),
        "schema_version": 1,
        "folder": result.folder,
        "summary": {
            "photos": len(result.items),
            "groups": result.group_count,
            "keepers": result.count("keeper"),
            "alternates": result.count("alternate"),
            "rejects": result.count("reject"),
            "unreadable": len(result.unreadable),
        },
        "items": [
            {
                "path": i.path, "group": i.group, "role": i.role, "score": i.score,
                "reasons": list(i.reasons), "sharpness": i.sharpness, "exposure": i.exposure,
                "eyes_open": i.eyes_open, "dhash": i.dhash,
            }
            for i in result.items
        ],
        "unreadable": [{"path": p, "error": e} for p, e in result.unreadable],
        "sidecars_written": list(result.sidecars_written),
        "sidecars_skipped_existing": list(result.sidecars_skipped),
        "caveat": (
            "Technical scores only (sharpness, exposure, framing, grain, tilt; closed eyes only "
            "with SHOOTFLOW_FACE_DETECTOR). Not yet checked against a photographer's real picks."
        ),
    }


def render_html(result: CullResult, score: PickScore | None = None) -> str:
    summary = result_to_dict(result)["summary"]
    assert isinstance(summary, dict)
    rows = []
    for item in result.items:
        reasons = ", ".join(item.reasons) or ""
        rows.append(
            f'<tr class="{item.role}"><td>{item.group}</td><td>{html.escape(item.path)}</td>'
            f"<td>{item.role}</td><td>{item.score:.2f}</td><td>{item.sharpness:.2f}</td>"
            f"<td>{item.exposure:.2f}</td><td>{html.escape(reasons)}</td></tr>"
        )
    pick_html = ""
    if score:
        rate = lambda v: "n/a" if v is None else f"{v:.0%}"  # noqa: E731
        pick_html = (
            f"<h2>Against your picks</h2><p>{score.matched} of {score.picks} picks found. "
            f"The keeper was one of your picks in {score.keeper_hits} of {score.groups_with_a_pick} groups "
            f"({rate(score.keeper_hit_rate)}). Picks flagged reject: {len(score.picks_rejected)} "
            f"({rate(score.false_reject_rate)}).</p>"
        )
        if score.picks_rejected:
            pick_html += "<p>Rejected but picked: " + html.escape(", ".join(score.picks_rejected)) + "</p>"
        if score.unmatched:
            pick_html += "<p>Not found in the folder: " + html.escape(", ".join(score.unmatched[:50])) + "</p>"
    return (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Cull report</title>'
        "<style>body{font:15px system-ui;margin:24px;max-width:960px}table{border-collapse:collapse;width:100%}"
        "td,th{padding:4px 8px;border-bottom:1px solid #8884;text-align:left}"
        "tr.keeper td{background:#2a82}tr.reject td{background:#d222}</style></head><body>"
        f"<h1>Cull report</h1><p>{summary['photos']} photos in {summary['groups']} groups: "
        f"{summary['keepers']} keepers, {summary['alternates']} alternates, {summary['rejects']} rejects.</p>"
        + pick_html +
        "<table><tr><th>Group</th><th>Photo</th><th>Role</th><th>Score</th><th>Sharp</th><th>Exposure</th>"
        "<th>Why rejected</th></tr>" + "".join(rows) + "</table>"
        "<p>Technical scores only; not checked against a photographer's real picks. "
        "Scores are computed on your machine; no photo leaves it.</p></body></html>"
    )


def write_report(
    result: CullResult, out_dir: Path | str, score: PickScore | None = None
) -> tuple[Path, Path]:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    json_path, html_path = out / "cull_report.json", out / "cull_report.html"
    json_path.write_text(json.dumps(result_to_dict(result, score), indent=2, sort_keys=True) + "\n", encoding="utf-8")
    html_path.write_text(render_html(result, score), encoding="utf-8")
    return json_path, html_path
