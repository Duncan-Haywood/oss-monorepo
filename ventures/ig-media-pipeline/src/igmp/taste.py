"""Stage 3: Claude scores every candidate frame against the style guide."""
from __future__ import annotations

import logging

from . import media
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Metrics, Score
from .store import Store

log = logging.getLogger(__name__)
CHUNK = 200          # results are saved after every chunk, so a stopped run loses little


def describe(a: Asset) -> str:
    where = ", ".join(p for p in (a.location, a.event.replace("-", " ")) if p) or "unknown place"
    when = a.taken_at.strftime("%Y-%m-%d %H:%M") if a.taken_at else (a.date_label or "unknown date")
    return f"Shot on {when} at {where} with a {a.camera or 'camera'}."


def instructions(a: Asset) -> str:
    base = describe(a) + " Score it for the feed by the style guide."
    if a.kind == "video":
        return (base + " The image is a contact sheet of frames from one video clip, each labelled with "
                f"its time in seconds (clip length {a.duration_s or 0:.1f} s). Score the clip's best moment and "
                "set best_in_s/best_out_s to the 1.5-4 s stretch you would use in a reel. view_yaw_deg is null.")
    if a.kind == "video360":
        return (base + " The image is a contact sheet of a 360 camera clip: one row per moment, labelled with its "
                "time in seconds, each row holding four flat 90-degree views looking at yaw 0, 90, 180 and -90 "
                "(0 = camera front, positive = turning right). Set best_in_s/best_out_s to the best 1.5-4 s stretch "
                "and view_yaw_deg to the direction worth showing (-180..180).")
    if a.kind == "photo360":
        return (base + " The image is a 360 camera photo: at the top a full panorama (yaw -180 at the left edge, "
                "0 in the middle, +180 at the right) with a yaw scale under it, and below four flat 90-degree views at "
                "yaw 0, 90, 180 and -90. Judge the best flat crop you could cut from it and set view_yaw_deg to its "
                "direction. best_in_s/best_out_s are null.")
    return base + " best_in_s, best_out_s and view_yaw_deg are null."


def score_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset]) -> int:
    todo = []
    for a in assets:
        m = store.get("metrics", a.id, Metrics)
        if m and m.candidate and not store.has("scores", a.id):
            todo.append(a)
    log.info("scoring %d candidates", len(todo))
    done = 0
    for i in range(0, len(todo), CHUNK):
        part = todo[i:i + CHUNK]
        tasks = [JudgeTask(key=a.id, output=Score, images=[media.preview_image(a, cfg)],
                           instructions=instructions(a), effort="low", max_tokens=6000) for a in part]
        for key, result in judge.judge_many(tasks).items():
            if isinstance(result, JudgeError):
                store.put("jobs", f"score:{key}", {"error": str(result)})
                continue
            store.put("scores", key, result)
            done += 1
        log.info("scored %d/%d", min(i + CHUNK, len(todo)), len(todo))
    return done
