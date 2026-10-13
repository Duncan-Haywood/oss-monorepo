"""Stage 4: feed photos. Three agents, each checking the one before:

  curator   looks at an event's keepers together and drops near-repeats and weak frames
  director  chooses RAW edit settings from the camera preview; RawTherapee renders them
  critic    compares camera JPEG and edit against a checklist: ship, revise (up to twice), or reject
"""
from __future__ import annotations

import logging
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import media, rawedit
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Curation, EditParams, EditReview, Score
from .store import Store
from .taste import describe

log = logging.getLogger(__name__)
MIN_SCORE = 6.5      # only frames good enough to post get a full RAW edit
REVISIONS = 2


def edit_dir(cfg: Config, a: Asset) -> Path:
    return cfg.output_dir / "photos" / (a.event_key or "undated")


def keepers(store: Store, assets: list[Asset]) -> list[tuple[Asset, Score]]:
    out = []
    for a in assets:
        s = store.get("scores", a.id, Score)
        if a.kind == "photo" and a.raw and s and s.keep and s.score >= MIN_SCORE:
            out.append((a, s))
    return out


# --- curator ---------------------------------------------------------------------------------------

def curate_task(key: str, picks: list[tuple[Asset, Score]], cfg: Config) -> JudgeTask:
    from .reels import sheet
    work = cfg.state_dir / "curation"
    work.mkdir(parents=True, exist_ok=True)
    path = work / f"{key}.jpg"
    sheet([media.preview_image(a, cfg) for a, _ in picks], [a.id for a, _ in picks]).save(path, quality=85)
    listing = "\n".join(f"{a.id}: score {s.score:.1f}, {s.role}, {s.subject}" for a, s in picks)
    return JudgeTask(
        key=key, output=Curation, images=[path], effort="medium",
        instructions=(
            f"These are the photos picked from '{key}' for the feed, each labelled with its id:\n{listing}\n\n"
            "You did not pick them. As a strict photo editor, drop every near-repeat of a better frame and "
            "anything that wouldn't hold up in a curated feed. Keep the set varied: place, moments, details. "
            "Return the ids to drop."))


def curate(cfg: Config, store: Store, judge: Backend, picks: list[tuple[Asset, Score]]) -> set[str]:
    by_event: dict[str, list[tuple[Asset, Score]]] = defaultdict(list)
    for a, s in picks:
        by_event[a.event_key].append((a, s))
    tasks = [curate_task(k, v, cfg) for k, v in by_event.items() if len(v) > 1 and not store.has("curation", k)]
    for key, result in judge.judge_many(tasks).items():
        if isinstance(result, JudgeError):
            store.put("jobs", f"curate:{key}", {"error": str(result)})
        else:
            store.put("curation", key, result)
    dropped: set[str] = set()
    for _, c in store.all("curation", Curation):
        dropped |= set(c.drop)
    return dropped


# --- director + critic ------------------------------------------------------------------------------

def direct(a: Asset, score: Score, cfg: Config) -> JudgeTask:
    return JudgeTask(
        key=a.id, output=EditParams, images=[media.preview_image(a, cfg)], effort="medium",
        instructions=(
            f"{describe(a)} This is the camera's own JPEG of a RAW file. Choose global RAW edit settings "
            f"that give the style guide's look, and a {cfg.photo_aspect} crop (crop_focus = centre of the "
            f"crop, crop_zoom 1.0 = the largest crop of that shape). Earlier notes on this frame: "
            f"{score.edit_notes or 'none'}. Issues seen: {'; '.join(score.issues) or 'none'}. "
            "Use straighten_deg only for a tilted horizon or verticals."))


def critic(a: Asset, params: EditParams, rendered: Path, cfg: Config) -> JudgeTask:
    return JudgeTask(
        key=a.id, output=EditReview, images=[media.preview_image(a, cfg), rendered], effort="medium",
        instructions=(
            f"{describe(a)} The first image is the camera JPEG; the second is an edit rendered from the RAW "
            f"with these settings: {params.model_dump_json()}. You did not make this edit. Judge it strictly "
            "against the style guide's look and fill in every check. verdict 'ship' only if every check passes; "
            "'revise' with complete revised settings if it can be fixed; 'reject' if the frame can't be saved."))


def finish(a: Asset, params: EditParams, cfg: Config, judge: Backend) -> dict:
    notes = []
    for round_ in range(REVISIONS + 1):
        result = rawedit.render_raw(a.raw, params, edit_dir(cfg, a), cfg)
        verdict = judge.judge(critic(a, params, Path(result["ig"]), cfg))
        notes.append(verdict.notes)
        if verdict.verdict == "ship" and verdict.passes:
            status = "shipped"
            break
        if verdict.verdict == "reject" or not verdict.revised or round_ == REVISIONS:
            status = "rejected" if verdict.verdict == "reject" else "held"
            break
        params = verdict.revised
    return {"status": status, "params": params.model_dump(), "notes": notes, "rounds": round_ + 1,
            **{k: str(v) for k, v in result.items()}}


def edit_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset]) -> int:
    picks = keepers(store, assets)
    dropped = curate(cfg, store, judge, picks)
    todo = [(a, s) for a, s in picks if a.id not in dropped and not store.has("edits", a.id)]
    log.info("editing %d keepers (%d dropped by the curator)", len(todo), len(dropped))
    by_id = {a.id: a for a, _ in todo}
    plans = judge.judge_many([direct(a, s, cfg) for a, s in todo])

    def one(item) -> bool:
        key, params = item
        if isinstance(params, JudgeError):
            store.put("jobs", f"edit:{key}", {"error": str(params)})
            return False
        try:
            record = finish(by_id[key], params, cfg, judge)
        except (JudgeError, RuntimeError, OSError) as e:
            store.put("jobs", f"edit:{key}", {"error": str(e)})
            return False
        store.put("edits", key, record)
        return record["status"] == "shipped"

    with ThreadPoolExecutor(cfg.parallel) as pool:
        return sum(pool.map(one, plans.items()))
