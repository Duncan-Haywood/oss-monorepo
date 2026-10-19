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
from typing import Callable

from . import media, rawedit
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Curation, EditParams, EditReview, Score
from .store import Store
from .taste import describe

log = logging.getLogger(__name__)
MIN_SCORE = 6.5      # frames this good always get a full RAW edit
TOP_SHARE = 0.25     # ...and so does the best 25% of each event's keepers (at least TOP_MIN),
TOP_MIN = 6          # because the scale is strict, and carousels need 5-20 strong frames an event
FLOOR = 5.0          # but never below this
REVISIONS = 2


def needs_review(cfg: Config, event_key: str) -> bool:
    """Events that feature other people (setting `review_events`) wait for the owner's approval."""
    return any(s and s in event_key for s in cfg.extra.get("review_events", []))


def edit_dir(cfg: Config, a: Asset) -> Path:
    from .outputs import out_path
    base = out_path(cfg, "photos")      # the outbox while the output drive is away
    if needs_review(cfg, a.event_key):
        base = base / "_review"
    return base / (a.event_key or "undated")


def keepers(store: Store, assets: list[Asset]) -> list[tuple[Asset, Score]]:
    """Photos worth a full RAW edit: every frame at MIN_SCORE or above, plus each event's best."""
    by_event: dict[str, list[tuple[Asset, Score]]] = defaultdict(list)
    for a in assets:
        s = store.get("scores", a.id, Score)
        if a.kind == "photo" and a.raw and s and s.keep and s.score >= FLOOR:
            by_event[a.event_key].append((a, s))
    out = []
    for picks in by_event.values():
        picks.sort(key=lambda p: -p[1].score)
        top = max(TOP_MIN, round(len(picks) * TOP_SHARE))
        out += [p for i, p in enumerate(picks) if p[1].score >= MIN_SCORE or i < top]
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
    # An event is curated again when its picks change (more of it was scored since), so late
    # frames don't skip the curator; "meta" keeps the ids each verdict was given for.
    seen = {k: sorted(a.id for a, _ in v) for k, v in by_event.items()}
    tasks = [curate_task(k, v, cfg) for k, v in by_event.items()
             if len(v) > 1 and not (store.has("curation", k) and store.get("meta", f"curated:{k}") == seen[k])]

    def save(key: str, result) -> None:
        if isinstance(result, JudgeError):
            store.put("jobs", f"curate:{key}", {"error": str(result)})
        else:
            store.put("curation", key, result)
            store.put("meta", f"curated:{key}", seen[key])

    judge.judge_many(tasks, on_result=save)
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
            "that give the style guide's look, and a crop: choose the feed shape (aspect) - 4:5 portrait "
            "fills the most screen, but never at the cost of the composition: a wide landscape whose subject "
            "spans the frame gets 1:1 or 1.91:1 - then crop_focus (centre of the crop) and crop_zoom (1.0 = "
            "the largest crop of that shape). Earlier notes on this frame: "
            f"{score.edit_notes or 'none'}. Issues seen: {'; '.join(score.issues) or 'none'}. "
            "Use straighten_deg only for a tilted horizon or verticals. The render starts from the camera's "
            "own colour (each photo is colour-matched to its camera JPEG), so vibrance and saturation stack on "
            "top of already-finished colour: keep them small."))


def critic(a: Asset, params: EditParams, rendered: Path, cfg: Config) -> JudgeTask:
    return JudgeTask(
        key=a.id, output=EditReview, images=[media.preview_image(a, cfg), rendered], effort="medium",
        instructions=(
            f"{describe(a)} The first image is the camera JPEG; the second is an edit rendered from the RAW "
            f"with these settings: {params.model_dump_json()}. You did not make this edit. Judge it strictly "
            "against the style guide's look and fill in every check. verdict 'ship' only if every check passes; "
            "'revise' with complete revised settings if it can be fixed; 'reject' if the frame can't be saved."))


def finish(a: Asset, params: EditParams, cfg: Config, judge: Backend, *, start_round: int = 0,
           notes: list[str] | None = None,
           checkpoint: Callable[[EditParams, int, list[str]], None] | None = None) -> dict:
    """Render, critique, revise. checkpoint(params, next_round, notes) saves each revision, so a
    stopped run picks up at the round it was on (start_round, notes) instead of starting over."""
    notes = list(notes or [])
    round_ = start_round
    for round_ in range(start_round, REVISIONS + 1):
        result = rawedit.render_raw(a.raw, params, edit_dir(cfg, a), cfg, aspect=params.aspect,
                                    camera_jpeg=a.preview if a.preview != a.raw else None)
        verdict = judge.judge(critic(a, params, Path(result["ig"]), cfg))
        notes.append(verdict.notes)
        if verdict.verdict == "ship" and verdict.passes:
            status = "shipped"
            break
        if verdict.verdict == "reject" or not verdict.revised or round_ == REVISIONS:
            status = "rejected" if verdict.verdict == "reject" else "held"
            break
        params = verdict.revised
        if checkpoint:
            checkpoint(params, round_ + 1, notes)
    return {"status": status, "params": params.model_dump(), "notes": notes, "rounds": round_ + 1,
            **{k: (v if isinstance(v, (dict, int, float)) or v is None else str(v)) for k, v in result.items()}}


def edit_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset]) -> int:
    """Every step is saved on the way: the director's settings as each arrives, each critic
    revision, then the finished edit. A stopped run resumes from the last saved step."""
    picks = keepers(store, assets)
    dropped = curate(cfg, store, judge, picks)
    todo = [a for a, s in picks if a.id not in dropped and not store.has("edits", a.id)]
    unplanned = [(a, s) for a, s in picks if a in todo and not store.has("edit_plans", a.id)]
    log.info("editing %d keepers (%d dropped by the curator, %d already directed)",
             len(todo), len(dropped), len(todo) - len(unplanned))

    def planned(key: str, params) -> None:
        if isinstance(params, JudgeError):
            store.put("jobs", f"edit:{key}", {"error": str(params)})
        else:
            store.put("edit_plans", key, {"params": params.model_dump(), "round": 0, "notes": []})

    judge.judge_many([direct(a, s, cfg) for a, s in unplanned], on_result=planned)

    def one(a: Asset) -> bool:
        wip = store.get("edit_plans", a.id)
        if wip is None:                  # the director failed; recorded in jobs, retried next run
            return False

        def checkpoint(params: EditParams, next_round: int, notes: list[str]) -> None:
            store.put("edit_plans", a.id, {"params": params.model_dump(), "round": next_round, "notes": notes})

        try:
            record = finish(a, EditParams.model_validate(wip["params"]), cfg, judge,
                            start_round=wip["round"], notes=wip["notes"], checkpoint=checkpoint)
        except (JudgeError, RuntimeError, OSError) as e:
            store.put("jobs", f"edit:{a.id}", {"error": str(e)})
            return False
        store.put("edits", a.id, record)
        store.delete("edit_plans", a.id)
        return record["status"] == "shipped"

    with ThreadPoolExecutor(cfg.parallel) as pool:
        return sum(pool.map(one, todo))
