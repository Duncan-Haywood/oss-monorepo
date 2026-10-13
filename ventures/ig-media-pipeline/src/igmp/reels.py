"""Stage 5: one 15-second reel per event. A story pass picks and orders shots from the scored
candidates, ffmpeg renders it, and a critic watches the result and revises up to twice."""
from __future__ import annotations

import logging
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw

from . import media, render
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Critique, ReelPlan, Score, Shot
from .store import Store

log = logging.getLogger(__name__)
MIN_KEEPERS = 4      # an event needs this many usable shots to make a reel
MAX_OPTIONS = 30     # candidates shown to the story pass, best first
CRITIC_ROUNDS = 3    # revisions before a failing reel is set aside for a human
HOOK_SECONDS = 2.0   # the opening gets its own, denser look


def merge_trips(groups: dict[str, list[tuple[Asset, Score]]]) -> dict[str, list[tuple[Asset, Score]]]:
    """Days too thin for a reel on their own join consecutive days with the same place and event
    (a road trip filmed a few clips a day becomes one reel, keyed 'first..last_Place_Event')."""
    out, thin = {}, defaultdict(list)
    for key, items in groups.items():
        day, _, rest = key.partition("_")
        if len(items) >= MIN_KEEPERS or not rest or "xx" in day:
            out[key] = items
        else:
            thin[rest].append((day, items))
    for rest, days in thin.items():
        days.sort()
        run = [days[0]]
        for day, items in days[1:]:
            prev = datetime.strptime(run[-1][0], "%Y-%m-%d")
            if (datetime.strptime(day, "%Y-%m-%d") - prev).days <= 2:
                run.append((day, items))
                continue
            out[_run_key(run, rest)] = [x for _, it in run for x in it]
            run = [(day, items)]
        out[_run_key(run, rest)] = [x for _, it in run for x in it]
    return out


def _run_key(run: list, rest: str) -> str:
    first, last = run[0][0], run[-1][0]
    return f"{first}_{rest}" if first == last else f"{first}..{last[5:]}_{rest}"


def options_for(store: Store, assets: list[Asset]) -> dict[str, list[tuple[Asset, Score]]]:
    by_event: dict[str, list[tuple[Asset, Score]]] = defaultdict(list)
    for a in assets:
        s = store.get("scores", a.id, Score)
        if s and s.keep and s.role != "skip" and a.event_key:
            by_event[a.event_key].append((a, s))
    return {k: sorted(v, key=lambda x: -x[1].score)[:MAX_OPTIONS]
            for k, v in merge_trips(by_event).items() if len(v) >= MIN_KEEPERS}


def sheet(images: list[Path], labels: list[str], cols: int = 6, cell: int = 300) -> Image.Image:
    rows = math.ceil(len(images) / cols)
    out = Image.new("RGB", (cols * cell, rows * (cell + 24)), "white")
    draw = ImageDraw.Draw(out)
    for i, (p, label) in enumerate(zip(images, labels)):
        im = Image.open(p).convert("RGB")
        im.thumbnail((cell, cell))
        x, y = (i % cols) * cell, (i // cols) * (cell + 24)
        out.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2))
        draw.text((x + 6, y + cell + 4), label, fill="black")
    return out


def source_for(a: Asset, store: Store) -> dict:
    edit = store.get("edits", a.id)
    if a.kind == "photo" and edit and edit.get("status") == "shipped":
        return {"kind": "photo", "path": edit["full"]}
    if a.kind in ("video", "video360"):
        return {"kind": a.kind, "path": a.preview}
    return {"kind": a.kind, "path": a.preview or a.raw}


def listing(opts: list[tuple[Asset, Score]]) -> str:
    lines = []
    for i, (a, s) in enumerate(opts):
        extra = ""
        if a.kind.startswith("video"):
            extra = f", clip {a.duration_s or 0:.1f}s, best {s.best_in_s}-{s.best_out_s}s"
        if a.kind.endswith("360"):
            extra += f", look yaw {s.view_yaw_deg}"
        lines.append(f"#{i} id={a.id} {a.kind}, score {s.score:.1f}, role {s.role}, {s.subject}, "
                     f"focus ({s.vertical_focus.x:.2f},{s.vertical_focus.y:.2f}){extra}")
    return "\n".join(lines)


def story_task(key: str, opts: list[tuple[Asset, Score]], cfg: Config, sheet_path: Path) -> JudgeTask:
    return JudgeTask(
        key=key, output=ReelPlan, images=[sheet_path], effort="high", max_tokens=16000,
        instructions=(
            f"Build one Instagram reel for the event '{key}'. The image shows the candidates, labelled #n. "
            f"Candidates:\n{listing(opts)}\n\n"
            f"Rules: total length at most {cfg.reel_seconds:g} s; shot durations are multiples of "
            f"{cfg.beat_seconds:g} s (the beat grid; music is added later); follow the style guide's reel rules. "
            "Use the candidate ids exactly. For videos set start_s inside the clip (use the best stretch); "
            "for stills start_s is 0. focus is the centre of the 9:16 crop. Set view_yaw_deg for 360 items. "
            "Pick a cover from the shots used. Write the caption by the style guide."))


def hook_strip(video: Path, cfg: Config, out: Path, step: float = 0.25) -> Path:
    """The first seconds at a quarter-second pitch, so the critic can judge the hook."""
    times = [round(i * step, 2) for i in range(int(HOOK_SECONDS / step))]
    frames = [media.frame_at(video, t, cfg, size=360) for t in times]
    strip = Image.new("RGB", (sum(f.width for f in frames), max(f.height for f in frames) + 24), "white")
    draw, x = ImageDraw.Draw(strip), 0
    for t, f in zip(times, frames):
        strip.paste(f, (x, 0))
        draw.text((x + 6, f.height + 4), f"{t:.2f}s", fill="black")
        x += f.width
    strip.save(out, quality=85)
    return out


def critic_task(key: str, plan: ReelPlan, hook: Path, contact: Path, options: str) -> JudgeTask:
    return JudgeTask(
        key=key, output=Critique, images=[hook, contact], effort="high", max_tokens=16000,
        instructions=(
            "You did not make this reel. Judge it as a strict outside editor would before it goes on the "
            "account. The first image is its opening, a frame every quarter second; the second is the whole "
            f"reel, a frame every half second. The plan that made it: {plan.model_dump_json()}\n"
            f"Candidates it could have used:\n{options}\n\n"
            "Fill in every check from the style guide's critique checklist. verdict 'ship' only if every check "
            "passes. Otherwise 'revise' with a complete revised plan, using only candidate ids."))


def snap(plan: ReelPlan, cfg: Config, valid: dict[str, Asset]) -> ReelPlan:
    """Hold Claude's plan to the hard rules: known ids, beat grid, total length, clip bounds."""
    beat, shots, total = cfg.beat_seconds, [], 0.0
    for s in plan.shots:
        a = valid.get(s.asset_id)
        if a is None:
            continue
        d = max(beat, round(s.duration_s / beat) * beat)
        if total + d > cfg.reel_seconds + 1e-6:
            d = math.floor((cfg.reel_seconds - total) / beat) * beat
            if d < beat:
                break
        start = s.start_s
        if a.duration_s:
            start = min(max(0.0, start), max(0.0, a.duration_s - d))
        shots.append(s.model_copy(update={"duration_s": d, "start_s": start}))
        total += d
    if not shots:
        raise JudgeError("plan had no usable shots")
    cover = plan.cover_asset_id if plan.cover_asset_id in {s.asset_id for s in shots} else shots[0].asset_id
    return plan.model_copy(update={"shots": shots, "cover_asset_id": cover})


def build(key: str, opts: list[tuple[Asset, Score]], cfg: Config, store: Store, judge: Backend) -> dict:
    work = cfg.state_dir / "reels" / key
    work.mkdir(parents=True, exist_ok=True)
    previews = [media.preview_image(a, cfg) for a, _ in opts]
    sheet_path = work / "candidates.jpg"
    sheet(previews, [f"#{i}" for i in range(len(opts))]).save(sheet_path, quality=85)
    valid = {a.id: a for a, _ in opts}
    plan = snap(judge.judge(story_task(key, opts, cfg, sheet_path)), cfg, valid)

    video = work / "draft.mp4"
    history = []
    shipped = False
    for round_ in range(CRITIC_ROUNDS + 1):
        sources = {s.asset_id: source_for(valid[s.asset_id], store) for s in plan.shots}
        render.render_reel(plan, sources, video, cfg)
        contact = work / f"contact-{round_}.jpg"
        render.reel_contact_sheet(video, cfg).save(contact, quality=85)
        verdict = judge.judge(critic_task(key, plan, hook_strip(video, cfg, work / f"hook-{round_}.jpg"),
                                          contact, listing(opts)))
        history.append(verdict.model_dump())
        if verdict.verdict == "ship" and verdict.passes:
            shipped = True
            break
        if not verdict.revised or round_ == CRITIC_ROUNDS:
            break
        plan = snap(verdict.revised.model_copy(update={"event_key": key}), cfg, valid)

    # Only reels the critic passed land in reels/; the rest wait in reels/_needs-attention/.
    out_dir = cfg.output_dir / "reels" / ("" if shipped else "_needs-attention")
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / f"{key}.mp4"
    video.replace(final)
    (out_dir / f"{key}.caption.txt").write_text(plan.caption.strip() + "\n")
    cover = source_for(valid[plan.cover_asset_id], store)["path"]
    return {"status": "shipped" if shipped else "needs-attention", "video": str(final),
            "plan": plan.model_dump(), "cover": cover, "critic": history}


def build_all(cfg: Config, store: Store, judge: Backend, assets: list[Asset]) -> int:
    made = 0
    for key, opts in sorted(options_for(store, assets).items()):
        if store.has("reels", key):
            continue
        try:
            store.put("reels", key, build(key, opts, cfg, store, judge))
            made += 1
            log.info("reel done: %s", key)
        except (JudgeError, RuntimeError, OSError) as e:
            store.put("jobs", f"reel:{key}", {"error": str(e)})
            log.warning("reel failed: %s: %s", key, e)
    return made
