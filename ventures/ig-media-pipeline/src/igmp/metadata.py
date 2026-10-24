"""Write what the pipeline knows about each shot as XMP, so any photo tool can read it.

One sidecar per shot, next to its files (`<stem>.xmp`): camera originals are never rewritten.
Standard fields carry the human-facing record (corrected local time with its offset, place,
event, description, keywords, star rating, colour label); the `igmp:` namespace carries the
machine fields (score, role, crop centres, best clip stretch, 360 view, burst, edit status).
A sidecar another app already wrote (say, Lightroom develop settings) is merged through
exiftool, changing only our fields. Edited exports get the same metadata embedded.
"""
from __future__ import annotations

import hashlib
import json
import logging
import subprocess
from datetime import datetime
from pathlib import Path
from xml.sax.saxutils import escape
from zoneinfo import ZoneInfo

from .config import Config
from .geo import stored_fix
from .models import Asset, Metrics, Score
from .store import Store

log = logging.getLogger(__name__)

NS = "http://ns.igmp.dev/1.0/"
WRITER = "igmp"
LABELS = {"shipped": "Green", "keeper": "Yellow", "rejected": "Red", "held": "Purple"}
EXIFTOOL_CONFIG = Path(__file__).with_name("igmp_xmp.config")


def sidecar_path(a: Asset) -> Path:
    base = Path(a.raw or a.preview or a.files[0])
    return base.with_suffix(".xmp")


def place_of(a: Asset, cfg: Config) -> dict:
    return dict(cfg.places.get(a.location, {}))


def local_iso(a: Asset, place: dict) -> str | None:
    if not a.taken_at:
        return None
    tz = place.get("timezone")
    if tz:
        return a.taken_at.replace(tzinfo=ZoneInfo(tz)).isoformat(timespec="seconds")
    return a.taken_at.isoformat(timespec="seconds")


def pretty(label: str) -> str:
    return label.replace("-", " ")


def fields(a: Asset, cfg: Config, score: Score | None, metrics: Metrics | None, edit: dict | None,
           reels: list[str], geo: dict | None = None) -> dict:
    """Everything known about one shot, as plain values keyed by XMP property. `geo` is a
    phone-matched position (geo.match); it replaces the place's city-level coordinates."""
    place = place_of(a, cfg)
    when = local_iso(a, place)
    keywords, tree = [], []
    country, state, city = place.get("country", ""), place.get("state", ""), place.get("city", "")
    # a named spot inside a city (Harbor > Lighthouse Point); a place with no city is the spot itself
    spot = pretty(a.location) if city and a.location and pretty(a.location) != city else ""
    tree.append("|".join(p for p in ("Places", country, state, city or pretty(a.location), spot) if p))
    keywords += [p for p in (country, state, city, spot or pretty(a.location)) if p]
    if a.event:
        keywords.append(pretty(a.event)); tree.append(f"Events|{pretty(a.event)}")
    if a.camera:
        keywords.append(a.camera); tree.append(f"Cameras|{a.camera}")
    if a.kind.endswith("360"):
        keywords.append("360"); tree.append("Formats|360")
    if a.kind.startswith("video"):
        keywords.append("video")

    f: dict = {
        "dc:subject": [], "lr:hierarchicalSubject": [],
        "photoshop:City": city or pretty(a.location), "photoshop:State": state,
        "photoshop:Country": country, "Iptc4xmpCore:CountryCode": place.get("country_code", ""),
        "Iptc4xmpCore:Location": spot, "Iptc4xmpExt:Event": pretty(a.event),
        "igmp:AssetId": a.id, "igmp:EventKey": a.event_key, "igmp:Kind": a.kind, "igmp:Camera": a.camera,
    }
    if when:
        f.update({"exif:DateTimeOriginal": when, "photoshop:DateCreated": when, "xmp:CreateDate": when})
    if geo and geo.get("lat") is not None and geo.get("lon") is not None:
        f.update({"exif:GPSLatitude": _gps(geo["lat"], "NS"), "exif:GPSLongitude": _gps(geo["lon"], "EW"),
                  "igmp:GPSPrecision": geo.get("precision", "phone-match"), "igmp:GPSErrorM": geo.get("error_m")})
    elif place.get("lat") is not None and place.get("lon") is not None:
        f.update({"exif:GPSLatitude": _gps(place["lat"], "NS"), "exif:GPSLongitude": _gps(place["lon"], "EW"),
                  "igmp:GPSPrecision": "city"})
    if metrics:
        f.update({"igmp:Candidate": metrics.candidate, "igmp:BurstId": metrics.burst_id,
                  "igmp:Sharpness": round(metrics.sharpness, 1)})
    label = None
    if score:
        keywords += [w for w in (score.subject, score.mood) if w]
        tree += [f"Subjects|{score.subject}", f"Moods|{score.mood}", f"Roles|{score.role}"]
        f.update({
            "dc:description": score.subject + (f" - {score.mood}" if score.mood else ""),
            "xmp:Rating": max(1, min(5, round(score.score / 2))) if score.keep else 1,
            "igmp:Score": score.score, "igmp:Keep": score.keep, "igmp:Role": score.role,
            "igmp:VerticalFocus": f"{score.vertical_focus.x:.3f},{score.vertical_focus.y:.3f}",
            "igmp:FeedFocus": f"{score.feed_focus.x:.3f},{score.feed_focus.y:.3f}",
            "igmp:BestIn": score.best_in_s, "igmp:BestOut": score.best_out_s, "igmp:ViewYaw": score.view_yaw_deg,
            "igmp:Issues": list(score.issues), "igmp:EditNotes": score.edit_notes,
            "igmp:SequenceStyle": score.sequence_style, "igmp:SequenceFps": score.sequence_fps,
        })
        label = "keeper" if score.keep else None
    if edit:
        label = edit.get("status", label)
        f.update({"igmp:EditStatus": edit.get("status"), "igmp:EditFile": edit.get("full", "")})
    if label in LABELS:
        f["xmp:Label"] = LABELS[label]
    if reels:
        f["igmp:Reels"] = reels
    if cfg.extra.get("copyright"):
        f["dc:rights"] = cfg.extra["copyright"]
    f["dc:subject"] = sorted({k for k in keywords if k})
    f["lr:hierarchicalSubject"] = sorted({t for t in tree if t and not t.endswith("|")})
    return {k: v for k, v in f.items() if v not in (None, "", [])}


def _gps(value: float, hemis: str) -> str:
    v = abs(value)
    return f"{int(v)},{(v - int(v)) * 60:.4f}{hemis[0] if value >= 0 else hemis[1]}"


# --- serialising ---------------------------------------------------------------------------------

NAMESPACES = {
    "dc": "http://purl.org/dc/elements/1.1/", "xmp": "http://ns.adobe.com/xap/1.0/",
    "photoshop": "http://ns.adobe.com/photoshop/1.0/", "exif": "http://ns.adobe.com/exif/1.0/",
    "Iptc4xmpCore": "http://iptc.org/std/Iptc4xmpCore/1.0/xmlns/",
    "Iptc4xmpExt": "http://iptc.org/std/Iptc4xmpExt/2008-02-29/",
    "lr": "http://ns.adobe.com/lightroom/1.0/", "igmp": NS,
}
LANG_ALT = {"dc:description", "dc:rights", "Iptc4xmpExt:Event"}


def to_xmp(f: dict) -> str:
    """A complete XMP packet. Lists become rdf:Bag, language-alternative fields rdf:Alt."""
    lines = []
    for key, value in f.items():
        if isinstance(value, list):
            items = "".join(f"<rdf:li>{escape(str(v))}</rdf:li>" for v in value)
            lines.append(f"   <{key}><rdf:Bag>{items}</rdf:Bag></{key}>")
        elif key in LANG_ALT:
            lines.append(f'   <{key}><rdf:Alt><rdf:li xml:lang="x-default">{escape(str(value))}'
                         f"</rdf:li></rdf:Alt></{key}>")
        else:
            text = str(value).lower() if isinstance(value, bool) else str(value)
            lines.append(f"   <{key}>{escape(text)}</{key}>")
    xmlns = "\n    ".join(f'xmlns:{p}="{u}"' for p, u in NAMESPACES.items())
    return (
        '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="igmp">\n'
        ' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n'
        f'  <rdf:Description rdf:about=""\n    {xmlns}>\n'
        f"   <igmp:Writer>{WRITER}</igmp:Writer>\n"
        + "\n".join(lines) + "\n"
        "  </rdf:Description>\n </rdf:RDF>\n</x:xmpmeta>\n<?xpacket end=\"w\"?>\n"
    )


def exiftool_args(f: dict) -> list[str]:
    """The same fields as exiftool assignments, for merging into files other apps also write."""
    args = []
    for key, value in f.items():
        prefix, name = key.split(":")
        group = {"dc": "XMP-dc", "xmp": "XMP-xmp", "photoshop": "XMP-photoshop", "exif": "XMP-exif",
                 "Iptc4xmpCore": "XMP-iptcCore", "Iptc4xmpExt": "XMP-iptcExt", "lr": "XMP-lr",
                 "igmp": "XMP-igmp"}[prefix]
        tag = {"CountryCode": "CountryCode", "Location": "Location"}.get(name, name)
        if isinstance(value, list):
            args.append(f"-{group}:{tag}=")
            args += [f"-{group}:{tag}+={v}" for v in value]
        else:
            args.append(f"-{group}:{tag}={str(value).lower() if isinstance(value, bool) else value}")
    return args


def _ours(path: Path) -> bool:
    text = path.read_text(errors="ignore")
    return f"<igmp:Writer>{WRITER}</igmp:Writer>" in text and 'xmlns:crs=' not in text


def write_sidecar(a: Asset, f: dict, cfg: Config) -> Path:
    path = sidecar_path(a)
    if not path.exists() or _ours(path):
        tmp = path.with_suffix(".xmp.tmp")
        tmp.write_text(to_xmp(f), encoding="utf-8")
        tmp.replace(path)
    else:
        subprocess.run([cfg.exiftool, "-config", str(EXIFTOOL_CONFIG), "-overwrite_original", "-q",
                        *exiftool_args(f), str(path)], check=True, capture_output=True)
    return path


def embed(files: list[str], sidecar: Path, cfg: Config) -> None:
    """Copy the sidecar's XMP into files we created (edited exports), plus the IPTC caption."""
    for target in files:
        subprocess.run([cfg.exiftool, "-config", str(EXIFTOOL_CONFIG), "-overwrite_original", "-q",
                        "-tagsfromfile", str(sidecar), "-xmp:all", "-IPTC:Caption-Abstract<XMP-dc:Description",
                        "-IPTC:Keywords<XMP-dc:Subject", "-EXIF:DateTimeOriginal<XMP-exif:DateTimeOriginal",
                        "-EXIF:OffsetTimeOriginal<XMP-exif:DateTimeOriginal", target],
                       check=True, capture_output=True)


# --- the stage -----------------------------------------------------------------------------------

def tag_all(cfg: Config, store: Store, assets: list[Asset]) -> int:
    """Write or refresh every sidecar whose content changed since the last run."""
    reel_index: dict[str, list[str]] = {}
    for key, reel in store.all("reels"):
        for shot in reel.get("plan", {}).get("shots", []):
            reel_index.setdefault(shot["asset_id"], []).append(key)
    changed = []
    for a in assets:
        if a.kind == "sequence":          # virtual: its frames carry the metadata (burst id = sequence id)
            continue
        if not sidecar_path(a).parent.exists():   # its drive isn't connected: next run
            continue
        edit = store.get("edits", a.id)
        f = fields(a, cfg, store.get("scores", a.id, Score), store.get("metrics", a.id, Metrics),
                   edit, sorted(set(reel_index.get(a.id, []))), stored_fix(store, a.id))
        digest = hashlib.sha1(json.dumps(f, sort_keys=True, default=str).encode()).hexdigest()
        if store.get("meta", a.id) != {"digest": digest}:
            changed.append((a, f, edit, digest))

    def write(item):
        a, f, edit, digest = item
        try:
            sidecar = write_sidecar(a, f, cfg)
            if edit and edit.get("status") == "shipped":
                embed([edit[k] for k in ("full", "ig") if edit.get(k)], sidecar, cfg)
            return a.id, {"digest": digest}, None
        except (OSError, subprocess.CalledProcessError) as e:
            return a.id, None, str(e)

    # Small files on a USB drive: write in parallel, record in batches (one commit per batch).
    from concurrent.futures import ThreadPoolExecutor
    done, failed, written = [], [], 0
    with ThreadPoolExecutor(8) as pool:
        for key, meta, err in pool.map(write, changed):
            if err:
                failed.append((f"tag:{key}", {"error": err}))
            else:
                done.append((key, meta))
            if len(done) >= 200:
                store.put_many("meta", done); written += len(done); done = []
    store.put_many("meta", done); written += len(done)
    if failed:
        store.put_many("jobs", failed)
    log.info("metadata: %d sidecars written or refreshed (%d failed)", written, len(failed))
    return written
