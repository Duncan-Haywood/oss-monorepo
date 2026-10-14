"""Stage 5: one 15-second reel per event. A story pass picks and orders shots from the scored
candidates, ffmpeg renders it, and a critic watches the result and revises up to twice."""
from __future__ import annotations

import hashlib
import logging
import math
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from PIL import Image, ImageDraw

from . import media, music, render
from .config import Config
from .judge import Backend, JudgeError, JudgeTask
from .models import Asset, Critique, MusicChoice, ReelPlan, Score, Shot
from .store import Store

log = logging.getLogger(__name__)
MIN_KEEPERS = 4      # an event needs this many usable shots to make a reel
MAX_OPTIONS = 30     # candidates shown to the story pass, best first
CRITIC_ROUNDS = 3    # revisions before a failing reel is set aside for a human
HOOK_SECONDS = 2.0   # the opening gets its own, denser look
MIN_SHOT_S = 0.5     # with music: no shot shorter than this, whatever the tempo
MAX_SHOT_S = 6.0     # Shot.duration_s upper bound


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


def source_for(a: Asset, store: Store, cfg: Config | None = None, shot: Shot | None = None) -> dict:
    if a.kind == "sequence":    # timelapse / stop-motion: the rendered clip, or its sharpest frame (needs cfg)
        from . import sequences
        if cfg is None:
            raise ValueError(f"sequence {a.id}: source_for needs cfg to render the clip")
        keep = shot is not None and (shot.layout == "fit" or shot.focus_to is not None)
        return sequences.reel_source(a, store, cfg, keep_aspect=keep)
    edit = store.get("edits", a.id)
    if a.kind == "photo" and edit and edit.get("status") == "shipped":
        return {"kind": "photo", "path": edit["full"]}
    if a.kind in ("video", "video360"):
        return {"kind": a.kind, "path": a.preview}
    return {"kind": a.kind, "path": a.preview or a.raw}


def shape(a: Asset, cfg: Config | None) -> str:
    """'landscape 3:2', 'portrait 4:5', '16:9'... so the story pass knows what a 9:16 crop would cost."""
    if cfg is None or a.kind.endswith("360"):
        return ""
    try:
        if a.kind in ("video", "sequence"):
            info = media.probe(a.preview, cfg) if a.kind == "video" else {}
            w, h = info.get("width"), info.get("height")
        else:
            with Image.open(media.preview_image(a, cfg)) as im:
                w, h = im.size
    except Exception:
        return ""
    if not w or not h:
        return ""
    r = w / h
    named = min(((3 / 2, "3:2"), (16 / 9, "16:9"), (4 / 3, "4:3"), (1, "1:1"), (2 / 3, "2:3"), (4 / 5, "4:5"),
                 (3 / 4, "3:4"), (9 / 16, "9:16")), key=lambda x: abs(x[0] - r))[1]
    kind = "landscape" if r > 1.05 else "portrait" if r < 0.95 else "square"
    return f", {kind} {named}"


def listing(opts: list[tuple[Asset, Score]], cfg: Config | None = None) -> str:
    lines = []
    for i, (a, s) in enumerate(opts):
        extra = shape(a, cfg)
        if a.kind.startswith("video"):
            extra = f", clip {a.duration_s or 0:.1f}s, best {s.best_in_s}-{s.best_out_s}s"
        if a.kind.endswith("360"):
            extra += f", look yaw {s.view_yaw_deg}"
        lines.append(f"#{i} id={a.id} {a.kind}, score {s.score:.1f}, role {s.role}, {s.subject}, "
                     f"focus ({s.vertical_focus.x:.2f},{s.vertical_focus.y:.2f}){extra}")
    return "\n".join(lines)


def story_task(key: str, opts: list[tuple[Asset, Score]], cfg: Config, sheet_path: Path,
               tracks: dict[str, music.Track] | None = None, used: dict[str, int] | None = None) -> JudgeTask:
    if tracks:
        timing = (
            "Music: pick the track for this reel from the licensed library below (id, title, tempo, beat "
            "length, energy, tone and key, mood, length, suggested start, licence). Set music.track_id to its "
            "id and music.start_s to its listed start. Match the track's energy and mood to the footage; "
            f"when two fit equally, prefer the one used less.\n{music.listing(tracks, cfg.reel_seconds, used)}\n\n"
            f"Rules: total length at most {cfg.reel_seconds:g} s; give shot durations in seconds, roughly whole "
            "numbers of the chosen track's beats: every cut is moved onto that track's nearest beat and the "
            "reel ends on a bar line; follow the style guide's reel rules. ")
    else:
        timing = (f"Rules: total length at most {cfg.reel_seconds:g} s; shot durations are multiples of "
                  f"{cfg.beat_seconds:g} s (the beat grid; music is added later, so music is null); follow the "
                  "style guide's reel rules. ")
    return JudgeTask(
        key=key, output=ReelPlan, images=[sheet_path], effort="high", max_tokens=16000,
        instructions=(
            f"Build one Instagram reel for the event '{key}'. The image shows the candidates, labelled #n. "
            f"Candidates:\n{listing(opts, cfg)}\n\n" + timing +
            "Use the candidate ids exactly. For videos set start_s inside the clip (use the best stretch); "
            "for stills start_s is 0. focus is the centre of the 9:16 crop. Set view_yaw_deg for 360 items. "
            "A 9:16 crop keeps only about a third of a landscape frame's width: when the subject or the "
            "composition spans the width (a building, a skyline, a road curve), don't crop it off - either use "
            "layout 'fit' (the whole frame at full width over a blurred copy of itself) or a slow pan with "
            "focus_to (the crop travels across the frame over the shot, e.g. left third to right third). "
            "Portrait frames and tight details suit 'fill'. "
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


def critic_task(key: str, plan: ReelPlan, hook: Path, contact: Path, options: str,
                music_note: str = "", earlier: list[str] | None = None) -> JudgeTask:
    memory = ""
    if earlier:
        memory = ("Earlier critiques of this reel (each led to the revision you are looking at):\n"
                  + "\n".join(f"- round {i + 1}: {n}" for i, n in enumerate(earlier)) + "\n"
                  "Stay consistent with them: don't reverse an earlier call (such as which shot should open) "
                  "unless this render shows something new, and don't re-raise problems that are now fixed. "
                  "Judge the hook against the best the candidates allow, not against an ideal they don't contain.\n\n")
    return JudgeTask(
        key=key, output=Critique, images=[hook, contact], effort="high", max_tokens=16000,
        instructions=(
            "You did not make this reel. Judge it as a strict outside editor would before it goes on the "
            "account. The first image is its opening, a frame every quarter second; the second is the whole "
            f"reel, a frame every half second. The plan that made it: {plan.model_dump_json()}\n"
            + (f"Music: {music_note}\n" if music_note else "") +
            f"Candidates it could have used:\n{options}\n\n" + memory +
            "Fill in every check from the style guide's critique checklist. verdict 'ship' only if every check "
            "passes. Otherwise 'revise' with a complete revised plan, using only candidate ids."))


def snap(plan: ReelPlan, cfg: Config, valid: dict[str, Asset],
         tracks: dict[str, music.Track] | None = None) -> ReelPlan:
    """Hold Claude's plan to the hard rules: known ids, beat grid, total length, clip bounds.
    With a music library (`tracks`) the plan always gets a track and its cuts go on that
    track's beats; without one the fixed cfg.beat_seconds grid is used and music is dropped."""
    kept = [(s, valid[s.asset_id]) for s in plan.shots if s.asset_id in valid]
    choice = pick_music(plan, cfg, tracks) if tracks else None
    if choice is None:
        shots = _fixed_grid(kept, cfg)
    else:
        shots = _music_grid(kept, cfg, tracks[choice.track_id].info, choice.start_s)
    if not shots:
        raise JudgeError("plan had no usable shots")
    cover = plan.cover_asset_id if plan.cover_asset_id in {s.asset_id for s in shots} else shots[0].asset_id
    return plan.model_copy(update={"shots": shots, "cover_asset_id": cover, "music": choice})


def _clamp_start(s: Shot, a: Asset, d: float) -> float:
    start = s.start_s
    if a.duration_s:
        start = min(max(0.0, start), max(0.0, a.duration_s - d))
    return start


def _fixed_grid(kept: list[tuple[Shot, Asset]], cfg: Config) -> list[Shot]:
    beat, shots, total = cfg.beat_seconds, [], 0.0
    for s, a in kept:
        d = max(beat, round(s.duration_s / beat) * beat)
        if total + d > cfg.reel_seconds + 1e-6:
            d = math.floor((cfg.reel_seconds - total) / beat) * beat
            if d < beat:
                break
        shots.append(s.model_copy(update={"duration_s": d, "start_s": _clamp_start(s, a, d)}))
        total += d
    return shots


def pick_music(plan: ReelPlan, cfg: Config, tracks: dict[str, music.Track]) -> MusicChoice:
    """The plan's track and a start on one of its bar lines with a whole reel after it. A missing
    or unknown track id gets a library track chosen from the event key (stable across runs); a
    start that is not a bar line, or leaves too little music, gets the track's best window."""
    t = tracks.get(plan.music.track_id) if plan.music else None
    start = plan.music.start_s if t is not None else None
    if t is None:
        ids = sorted(tracks)
        t = tracks[ids[int(hashlib.sha1(plan.event_key.encode()).hexdigest(), 16) % len(ids)]]
        log.warning("reel %s: no usable music choice (%s); using %s", plan.event_key,
                    plan.music.track_id if plan.music else "none", t.id)
    if start is not None:
        bar = music.nearest_downbeat(t.info, start)
        ok = bar is not None and abs(bar - start) <= 0.1 and bar + cfg.reel_seconds <= t.info.duration_s - 0.2
        start = bar if ok else None
    if start is None:
        start = music.best_window(t.info, cfg.reel_seconds)
    return MusicChoice(track_id=t.id, start_s=round(start, 4))


def _music_grid(kept: list[tuple[Shot, Asset]], cfg: Config, info: music.TrackInfo, start: float) -> list[Shot]:
    """Cuts on the track's beats. Each boundary moves to the beat nearest where Claude's duration
    puts it (counted from the previous, already snapped boundary), keeping every shot between
    MIN_SHOT_S and MAX_SHOT_S and the reel within cfg.reel_seconds; the last cut then moves to a
    bar line when one is within a beat. Boundaries are whole frames, so each shot's frame count
    is exact and cuts stay within half a frame of the beat over the whole reel."""
    fps = render.FPS
    limit = int(math.floor(cfg.reel_seconds * fps + 1e-6))
    frames = sorted({round(g * fps) for g in music.beat_grid(info, start, cfg.reel_seconds)} - {0})
    frames = [f for f in frames if f <= limit]
    bars = {round(g * fps) for g in music.beat_grid(info, start, cfg.reel_seconds, downbeats_only=True)}
    lo, hi = math.ceil(MIN_SHOT_S * fps - 1e-6), math.floor(MAX_SHOT_S * fps + 1e-6)
    beat_f = info.beat_s * fps
    # a plan that runs to the full length ends on the last bar line, if that is not far back
    last_bar = max((f for f in bars if 0 < f <= limit), default=None)
    if (last_bar is not None and sum(s.duration_s for s, _ in kept) * fps >= limit - beat_f / 2
            and limit - last_bar <= max(beat_f, min(info.beats_per_bar * beat_f, 2.0 * fps)) + 0.5):
        limit = last_bar
        frames = [f for f in frames if f <= limit]
    cuts, prev = [], 0
    for s, a in kept:
        want = prev + s.duration_s * fps
        options = [f for f in frames if lo <= f - prev <= hi]
        if not options:
            break
        end = min(options, key=lambda f: (abs(f - want), f))
        cuts.append([s, a, prev, end])
        prev = end
    if cuts and cuts[-1][3] not in bars:
        s, a, p, end = cuts[-1]
        near = [f for f in bars if lo <= f - p <= hi and f <= limit and abs(f - end) <= beat_f + 0.5]
        if near:
            cuts[-1][3] = min(near, key=lambda f: (abs(f - end), -f))
    shots = []
    for s, a, p, e in cuts:
        d = (e - p) / fps
        shots.append(s.model_copy(update={"duration_s": d, "start_s": _clamp_start(s, a, d)}))
    return shots


def music_note(plan: ReelPlan, tracks: dict[str, music.Track], cfg: Config) -> str:
    """What the critic is told about the sound."""
    if not plan.music or plan.music.track_id not in tracks:
        return "none; a sound is added later in the Instagram app"
    t = tracks[plan.music.track_id]
    others = {k: v for k, v in tracks.items() if k != t.id}
    note = (f"{music.listing([t], cfg.reel_seconds)}; the reel starts {plan.music.start_s:.2f} s into the "
            "track and every cut is on its beat. In a revised plan keep this music unless it clearly fights "
            "the footage")
    if others:
        note += f"; the other tracks:\n{music.listing(others, cfg.reel_seconds)}"
    return note


def _music_used(store: Store) -> dict[str, int]:
    used: dict[str, int] = defaultdict(int)
    for _, rec in store.all("reels"):
        m = (rec.get("plan") or {}).get("music") if isinstance(rec, dict) else None
        if m and m.get("track_id"):
            used[m["track_id"]] += 1
    return dict(used)


def _render(plan: ReelPlan, sources: dict, video: Path, cfg: Config, tracks: dict[str, music.Track]) -> ReelPlan:
    """Render with the plan's music; if the mix fails, render silent rather than lose the reel.
    Returns the plan as rendered."""
    track = tracks.get(plan.music.track_id) if plan.music else None
    if track is None:
        plan = plan.model_copy(update={"music": None})
        render.render_reel(plan, sources, video, cfg)
        return plan
    try:
        render.render_reel(plan, sources, video, cfg, music=track.path)
        return plan
    except (RuntimeError, OSError, ValueError) as e:
        log.warning("reel %s: music mix failed, rendering without music: %s", plan.event_key, e)
        plan = plan.model_copy(update={"music": None})
        render.render_reel(plan, sources, video, cfg)
        return plan


def build(key: str, opts: list[tuple[Asset, Score]], cfg: Config, store: Store, judge: Backend) -> dict:
    work = cfg.state_dir / "reels" / key
    work.mkdir(parents=True, exist_ok=True)
    previews = [media.preview_image(a, cfg) for a, _ in opts]
    sheet_path = work / "candidates.jpg"
    sheet(previews, [f"#{i}" for i in range(len(opts))]).save(sheet_path, quality=85)
    valid = {a.id: a for a, _ in opts}
    tracks = music.load_library(cfg) if music.enabled(cfg) else {}
    if music.enabled(cfg) and not tracks:
        log.info("music: no licensed tracks in %s; reel %s stays silent", music.music_dir(cfg), key)
    plan = snap(judge.judge(story_task(key, opts, cfg, sheet_path, tracks, _music_used(store))),
                cfg, valid, tracks)

    video = work / "draft.mp4"
    history = []
    shipped = False
    for round_ in range(CRITIC_ROUNDS + 1):
        sources = {s.asset_id: source_for(valid[s.asset_id], store, cfg, s) for s in plan.shots}
        plan = _render(plan, sources, video, cfg, tracks)
        contact = work / f"contact-{round_}.jpg"
        render.reel_contact_sheet(video, cfg).save(contact, quality=85)
        verdict = judge.judge(critic_task(key, plan, hook_strip(video, cfg, work / f"hook-{round_}.jpg"),
                                          contact, listing(opts, cfg), music_note(plan, tracks, cfg),
                                          [h["notes"] for h in history]))
        history.append(verdict.model_dump())
        if verdict.verdict == "ship" and verdict.passes:
            shipped = True
            break
        if not verdict.revised or round_ == CRITIC_ROUNDS:
            break
        revised = verdict.revised.model_copy(update={"event_key": key})
        if tracks and (revised.music is None or revised.music.track_id not in tracks):
            revised = revised.model_copy(update={"music": plan.music})     # keep the track
        plan = snap(revised, cfg, valid, tracks)

    # Only reels the critic passed land in reels/; the rest wait in reels/_needs-attention/.
    out_dir = cfg.output_dir / "reels" / ("" if shipped else "_needs-attention")
    out_dir.mkdir(parents=True, exist_ok=True)
    final = out_dir / f"{key}.mp4"
    video.replace(final)
    track = tracks.get(plan.music.track_id) if plan.music else None
    credit = music.attribution_line(track) if track else None
    caption = plan.caption.strip() + (f"\n\n{credit}" if credit else "")
    (out_dir / f"{key}.caption.txt").write_text(caption + "\n")
    cover = source_for(valid[plan.cover_asset_id], store, cfg)["path"]
    sound = None if track is None else {
        "track_id": track.id, "start_s": plan.music.start_s, "file": str(track.path), "title": track.title,
        "license": track.license.license, "source": track.license.source, "url": track.license.url,
        "attribution": credit}
    return {"status": "shipped" if shipped else "needs-attention", "video": str(final),
            "plan": plan.model_dump(), "cover": cover, "critic": history, "music": sound}


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
