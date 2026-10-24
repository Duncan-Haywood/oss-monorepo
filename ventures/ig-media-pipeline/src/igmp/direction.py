"""Creative direction for transitions: measure every cut, shortlist what could work there, and let
Claude choose for the whole reel in ONE call.

  boundary_features(a_seg, b_seg, cfg)   measured on the last ~6 frames of A and the first ~6 of B:
                                         brightness each side, colour histogram distance, structural
                                         similarity (SSIM and edge correlation at 135x240), the
                                         dominant motion and zoom rate at the end of A and the start
                                         of B (phase correlation at 270x480), still or video, and the
                                         subject points when the plan knows them
  candidates(features, beat_strength)    rule-based shortlist, each with a reason and a duration
                                         snapped to the beat grid (cut is always first)
  direct(plan_cuts, features, judge)     one structured Claude call for every cut of the reel
                                         (schema TransitionPlan, through judge.Backend so it runs on
                                         the Claude plan or the API); the answer is then held to the
                                         rules in code: only shortlisted kinds, the effect budget, no
                                         effect twice in a row, one AI hero, generative only if on
  direct_many(reels, judge)              the same for several reels through judge_many (the API
                                         backend sends those as one Message Batch at half price)

The judge reads style/TRANSITIONS.md (passed in the instructions; the system prompt stays the
shared style guide, so its cache is not broken).
"""
from __future__ import annotations

import logging
import math
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Literal

import numpy as np
from PIL import Image, ImageDraw
from pydantic import BaseModel, Field

from . import aitx
from .aitx import AI_KINDS, FPS, SUPPORTED, Transition, TransitionSpec, box_blur, phase_shift
from .config import Config
from .judge import JudgeError, JudgeTask

log = logging.getLogger(__name__)

AN_W, AN_H = 135, 240           # similarity analysis size (1/8 of the reel)
MO_W, MO_H = 270, 480           # motion analysis size (1/4)
TAIL = 6                        # frames measured on each side of a cut
GUIDE = Path(__file__).resolve().parents[2] / "style" / "TRANSITIONS.md"

# duration ranges (seconds) per kind: (shortest, preferred, longest)
DURATIONS = {
    "whip": (0.27, 0.33, 0.5),
    "zoom_through": (0.33, 0.47, 0.67),
    "match_dissolve": (0.4, 0.53, 0.8),
    "morph": (0.4, 0.6, 0.8),
    "luma_dip": (0.5, 0.67, 1.0),
    "flash": (0.27, 0.4, 0.53),
    "speed_ramp_cut": (0.4, 0.6, 0.8),
    "depth_parallax_through": (0.8, 1.0, 1.27),
    "generative": (0.8, 1.07, 1.6),
}
# A flash is offered only on a hit in the music: without one the critic read it as a gimmick (9 of
# 11 flashes it remarked on, 2026-10-19, most of them "no hit to motivate it" on a silent reel).
FLASH_MIN_BEAT = 0.8
# aitx's kinds and the renderer's own built-ins (crossfade, whip-left/right, zoom-in, dip-black)
EffectKind = Literal["cut", "morph", "depth_parallax_through", "generative", "whip", "zoom_through",
                     "match_dissolve", "luma_dip", "flash", "speed_ramp_cut",
                     "crossfade", "whip-left", "whip-right", "zoom-in", "dip-black"]


# =========================================================================== features


class CutFeatures(BaseModel):
    """What is measurable about one cut, from the frames either side of it."""
    luma_a: float = Field(description="mean brightness of A's last frames, 0..1")
    luma_b: float = Field(description="mean brightness of B's first frames, 0..1")
    hist_dist: float = Field(description="colour histogram distance, 0 same palette .. 1 nothing shared")
    ssim: float = Field(description="structural similarity of A's last and B's first frame, -1..1")
    edge_corr: float = Field(description="correlation of their edge maps, -1..1")
    similarity: float = Field(description="0..1 blend of the three; morph wants >= 0.62")
    motion_a: tuple[float, float] = Field(description="content motion at the end of A, px/frame at 1080x1920")
    motion_b: tuple[float, float] = Field(description="content motion at the start of B, px/frame")
    zoom_a: float = Field(description="scale change per frame at the end of A (+ pushing in)")
    zoom_b: float = Field(description="scale change per frame at the start of B")
    still_a: bool = Field(description="A is a still (Ken Burns / parallax), not live video")
    still_b: bool
    focus_a: tuple[float, float] | None = None
    focus_b: tuple[float, float] | None = None
    frames_a: int = 0
    frames_b: int = 0

    def summary(self) -> str:
        def mv(m):
            return f"({m[0]:+.0f},{m[1]:+.0f})"
        return (f"luma {self.luma_a:.2f}->{self.luma_b:.2f}, palette dist {self.hist_dist:.2f}, ssim {self.ssim:.2f}, "
                f"edges {self.edge_corr:.2f}, similarity {self.similarity:.2f}, motion A{mv(self.motion_a)} "
                f"B{mv(self.motion_b)} px/f, zoom A{self.zoom_a * 100:+.2f}% B{self.zoom_b * 100:+.2f}%/f, "
                f"{'still' if self.still_a else 'video'}->{'still' if self.still_b else 'video'}")


def _small(seg: str | Path, start: int, count: int, cfg: Config, info, w: int, h: int) -> np.ndarray:
    return aitx._f(aitx.read_frames(seg, start, count, cfg, info, size=(w, h)))


def _ssim(a: np.ndarray, b: np.ndarray) -> float:
    c1, c2 = 0.01 ** 2, 0.03 ** 2
    mu_a, mu_b = box_blur(a, 3, 1), box_blur(b, 3, 1)
    va = box_blur(a * a, 3, 1) - mu_a ** 2
    vb = box_blur(b * b, 3, 1) - mu_b ** 2
    cov = box_blur(a * b, 3, 1) - mu_a * mu_b
    s = ((2 * mu_a * mu_b + c1) * (2 * cov + c2)) / ((mu_a ** 2 + mu_b ** 2 + c1) * (va + vb + c2))
    return float(np.mean(s))


def _edges(a: np.ndarray) -> np.ndarray:
    gy, gx = np.gradient(box_blur(a, 1, 1))
    return np.hypot(gx, gy)


def _corr(a: np.ndarray, b: np.ndarray) -> float:
    a, b = a - a.mean(), b - b.mean()
    d = math.sqrt(float((a * a).sum()) * float((b * b).sum()))
    return float((a * b).sum() / d) if d > 1e-12 else 0.0


def _hist(rgb: np.ndarray) -> np.ndarray:
    q = np.clip((rgb * 8).astype(np.int64), 0, 7)
    h = np.bincount((q[..., 0] * 64 + q[..., 1] * 8 + q[..., 2]).ravel(), minlength=512).astype(np.float64)
    return h / max(h.sum(), 1)


def _motion(frames: np.ndarray) -> tuple[tuple[float, float], float, float]:
    """((dx, dy) px/frame at full size, zoom per frame, residual) from the first and last of a short
    run of frames (rgb, MO_W x MO_H): phase correlation of the whole frame for the translation and
    of its halves for the zoom; the residual after undoing both says still (~0) or video."""
    if len(frames) < 2:
        return (0.0, 0.0), 0.0, 0.0
    gap = len(frames) - 1
    a, b = aitx.luma(frames[0]), aitx.luma(frames[-1])
    h, w = a.shape
    dx, dy, _ = phase_shift(a, b)
    lx, _, _ = phase_shift(a[:, : w // 2], b[:, : w // 2])
    rx, _, _ = phase_shift(a[:, w // 2:], b[:, w // 2:])
    _, ty, _ = phase_shift(a[: h // 2], b[: h // 2])
    _, by, _ = phase_shift(a[h // 2:], b[h // 2:])
    zx, zy = (rx - lx) / (w / 2), (by - ty) / (h / 2)
    zoom = float(np.clip((zx + zy) / 2, -0.5, 0.5))
    scale = (1 + zoom) ** (1 / gap) - 1 if zoom > -1 else 0.0
    # residual of the last pair after undoing the measured move (zoom about the centre + shift)
    p, q = aitx.luma(frames[-2]), b
    z1 = 1 + scale
    sx, sy = dx / gap, dy / gap
    s = 1 / z1
    c = aitx._affine(p[..., None], (s, 0, w / 2 * (1 - s) - sx * s, 0, s, h / 2 * (1 - s) - sy * s))[..., 0]
    m = 6 + int(math.ceil(max(abs(sx), abs(sy)) + abs(scale) * max(w, h)))
    resid = float(np.mean(np.abs(c[m:-m, m:-m] - q[m:-m, m:-m]))) if h > 2 * m and w > 2 * m else 0.0
    k = aitx.OUT_W / w
    return (dx / gap * k, dy / gap * k), float(scale), resid


STILL_RESIDUAL = 0.0035


def boundary_features(a_seg: str | Path, b_seg: str | Path, cfg: Config, *,
                      focus_a: tuple[float, float] | None = None, focus_b: tuple[float, float] | None = None,
                      a_kind: str | None = None, b_kind: str | None = None, n: int = TAIL) -> CutFeatures:
    """Measure the cut from A's last n frames and B's first n. a_kind / b_kind ("still" or "video")
    override the still detection when the renderer knows."""
    ia, ib = aitx.probe_segment(a_seg, cfg), aitx.probe_segment(b_seg, cfg)
    na, nb = min(n, ia.frames), min(n, ib.frames)
    ta = _small(a_seg, ia.frames - na, na, cfg, ia, MO_W, MO_H)
    tb = _small(b_seg, 0, nb, cfg, ib, MO_W, MO_H)
    la, lb = ta[-1], tb[0]
    sa, sb = aitx._resize(la, AN_W, AN_H, Image.BOX), aitx._resize(lb, AN_W, AN_H, Image.BOX)
    ya, yb = aitx.luma(sa), aitx.luma(sb)
    ha, hb = _hist(sa), _hist(sb)
    hist = float(math.sqrt(max(0.0, 1 - float(np.sum(np.sqrt(ha * hb))))))
    ssim = _ssim(ya, yb)
    edge = _corr(_edges(ya), _edges(yb))
    sim = float(np.clip(0.45 * max(ssim, 0) + 0.35 * max(edge, 0) + 0.2 * (1 - hist), 0, 1))
    ma, za, ra = _motion(ta)
    mb, zb, rb = _motion(tb)
    still_a = a_kind == "still" if a_kind else ra < STILL_RESIDUAL
    still_b = b_kind == "still" if b_kind else rb < STILL_RESIDUAL
    return CutFeatures(luma_a=float(aitx.luma(ta).mean()), luma_b=float(aitx.luma(tb).mean()), hist_dist=hist,
                       ssim=ssim, edge_corr=edge, similarity=sim, motion_a=ma, motion_b=mb, zoom_a=za, zoom_b=zb,
                       still_a=still_a, still_b=still_b, focus_a=focus_a, focus_b=focus_b,
                       frames_a=ia.frames, frames_b=ib.frames)


def reel_features(segments: list[str | Path], cfg: Config, focus: list | None = None,
                  kinds: list[str | None] | None = None) -> list[CutFeatures]:
    """boundary_features for every cut of a reel, measured in parallel (decoding dominates)."""
    focus = focus or [None] * len(segments)
    kinds = kinds or [None] * len(segments)

    def one(i):
        return boundary_features(segments[i], segments[i + 1], cfg, focus_a=focus[i], focus_b=focus[i + 1],
                                 a_kind=kinds[i], b_kind=kinds[i + 1])
    with ThreadPoolExecutor(min(4, max(1, len(segments) - 1))) as pool:
        return list(pool.map(one, range(len(segments) - 1)))


# =========================================================================== shortlist


def snap_duration(kind: str, beat_s: float | None = None, max_frames: int | None = None) -> float:
    """A duration for `kind` inside its range, on the beat grid when there is one (a multiple of a
    beat, half beat or quarter beat; the one nearest the preferred length), in an even number of
    frames so the cut sits exactly between two frames."""
    lo, pref, hi = DURATIONS[kind]
    options = []
    if beat_s and beat_s > 0:
        for div in (1, 2, 4):
            for m in range(1, 13):
                d = m * beat_s / div
                if lo - 1e-6 <= d <= hi + 1e-6:
                    options.append(d)
    d = min(options, key=lambda x: (abs(x - pref), x)) if options else pref
    frames = max(2, 2 * int(round(d * FPS / 2)))
    if max_frames is not None:
        frames = min(frames, max(2, max_frames // 2 * 2))
    return frames / FPS


def _camera_direction(m: tuple[float, float]) -> str:
    """The camera's swing for content moving by m (content left = camera right)."""
    dx, dy = m
    if abs(dx) >= abs(dy):
        return "right" if dx < 0 else "left"
    return "down" if dy < 0 else "up"


def candidates(f: CutFeatures, beat_strength: float | None = None, *, beat_s: float | None = None,
               chapter: bool = False, generative: bool = False,
               available: frozenset[str] | set[str] | None = None) -> list[tuple[TransitionSpec, str]]:
    """What could work at this cut, best first after the cut (which is always offered first: most
    cuts in a good reel are straight cuts on the beat). available: the kinds that render at full
    quality here (aitx.available_kinds); others are never offered, so a missing RIFE means a match
    dissolve is offered where a morph would have been. None: every kind."""
    strong = (beat_strength or 0) >= 0.8 or chapter
    room = 2 * max(0, min(f.frames_a, f.frames_b) - 1) if f.frames_a and f.frames_b else None
    out: list[tuple[TransitionSpec, str]] = [(TransitionSpec(kind="cut"), "a straight cut on the beat (the default)")]
    seen: set[str] = set()

    def add(kind: str, reason: str, **kw):
        if kind in seen or (available is not None and kind not in available):
            return
        seen.add(kind)
        out.append((TransitionSpec(kind=kind, duration_s=snap_duration(kind, beat_s, room),
                                   focus_a=f.focus_a, focus_b=f.focus_b, **kw), reason))

    la, lb = f.luma_a, f.luma_b
    ratio = max(la, lb) / max(min(la, lb), 0.02)
    va, vb = math.hypot(*f.motion_a), math.hypot(*f.motion_b)
    if f.similarity >= 0.62:
        add("morph", f"the frames nearly match (similarity {f.similarity:.2f}): a morph flows one into the other")
    if f.similarity >= 0.45 or (f.focus_a and f.focus_b):
        add("match_dissolve", f"shapes line up (similarity {f.similarity:.2f}): a dissolve with the subjects locked")
    if va >= 6:
        aligned = vb < 3 or (f.motion_a[0] * f.motion_b[0] + f.motion_a[1] * f.motion_b[1]) / (va * vb) > 0.5
        if aligned:
            add("whip", f"A ends moving {va:.0f} px/frame: whip on in the same direction",
                direction=_camera_direction(f.motion_a))
    elif vb >= 8:
        add("whip", f"B starts moving {vb:.0f} px/frame: whip into its motion", direction=_camera_direction(f.motion_b))
    if ratio >= 2.5 or abs(lb - la) >= 0.25:
        if la > lb:
            add("luma_dip", f"bright to dark ({la:.2f} -> {lb:.2f}): dip through the dark, B's highlights first",
                color="dark")
        elif (beat_strength or 0) >= FLASH_MIN_BEAT:
            add("flash", f"dark to bright ({la:.2f} -> {lb:.2f}) on a hit: a warm light leak hides the jump",
                color="warm")
    if f.zoom_a > 0.0015:
        add("zoom_through", f"A is pushing in ({f.zoom_a * 100:.2f}%/frame): carry the push through the cut")
    if strong:
        add("zoom_through", "a strong downbeat or a change of chapter: punch through")
        add("depth_parallax_through", "a strong moment: a 2.5D move through depth (best on stills and landscapes)")
        if not f.still_a:
            add("speed_ramp_cut", "A is live video: ease it down into the downbeat")
        if generative and chapter:
            add("generative", "one hero moment for a generated in-between (slow; at most once per reel)")
    return out


# =========================================================================== one Claude call per reel


class PlanCut(BaseModel):
    """A cut of the reel as the director sees it."""
    at_s: float = Field(description="time of the cut in the reel, seconds")
    beat_strength: float | None = Field(None, description="0..1; 1 = a bar line / downbeat")
    chapter: bool = Field(False, description="a change of place, time of day or scene")
    a: str = Field("", description="the outgoing shot: subject, role")
    b: str = Field("", description="the incoming shot")


class CutChoice(BaseModel):
    cut: int = Field(description="index of the cut, as listed")
    kind: EffectKind = Field(description="one of that cut's shortlisted kinds")
    duration_s: float = Field(description="seconds; keep the shortlisted duration unless the beat says otherwise")
    direction: Literal["left", "right", "up", "down"] | None = Field(None, description="whip only: camera direction")
    reason: str = Field(description="one short sentence")


class TransitionPlan(BaseModel):
    cuts: list[CutChoice]
    notes: str = Field(description="one or two sentences on the reel's transition rhythm")


def cuts_from_plan(plan, info=None, notes: dict[str, str] | None = None) -> list[PlanCut]:
    """PlanCut for every cut of a ReelPlan: time from the shots' frame counts, beat strength from the
    music (1.0 on a bar line, 0.6 on a beat, else half the onset strength there; None without
    music); shots described by `notes` (asset id -> "subject, role"). chapter is left False: the
    caller knows where the place or the time of day changes."""
    notes = notes or {}
    out, t = [], 0
    shots = plan.shots
    downs = set(round(x * FPS) for x in (getattr(info, "downbeats", None) or []))
    beats = set(round(x * FPS) for x in (getattr(info, "beats", None) or []))
    start = plan.music.start_s if getattr(plan, "music", None) else 0.0
    for s, nxt in zip(shots, shots[1:]):
        t += max(1, int(round(s.duration_s * FPS)))
        strength = None
        if info is not None:
            f = round(t + start * FPS)
            if any(abs(f - d) <= 1 for d in downs):
                strength = 1.0
            elif any(abs(f - d) <= 1 for d in beats):
                strength = 0.6
            else:
                onset, hop = getattr(info, "onset", None) or [], getattr(info, "hop_s", 0.0) or 0.0
                k = int(round((t / FPS + start) / hop)) if hop else -1
                strength = float(onset[k]) * 0.5 if 0 <= k < len(onset) else 0.2
        out.append(PlanCut(at_s=t / FPS, beat_strength=strength, a=notes.get(s.asset_id, s.asset_id),
                           b=notes.get(nxt.asset_id, nxt.asset_id)))
    return out


def guide_text(style: str | Path | None = None) -> str:
    if isinstance(style, str) and "\n" in style:
        return style
    path = Path(style) if style else GUIDE
    return path.read_text() if path.exists() else ""


def direction_task(key: str, plan_cuts: list[PlanCut], features: list[CutFeatures],
                   shortlists: list[list[tuple[TransitionSpec, str]]], *, style: str | Path | None = None,
                   reel_seconds: float = 15.0, tempo_bpm: float | None = None, generative: bool = False,
                   sheet: Path | None = None) -> JudgeTask:
    lines = []
    for i, (pc, f, sl) in enumerate(zip(plan_cuts, features, shortlists)):
        opts = "; ".join(f"{s.kind}{' ' + s.direction if s.direction else ''} {s.duration_s:.2f}s ({why})"
                         for s, why in sl)
        beat = "no music" if pc.beat_strength is None else f"beat strength {pc.beat_strength:.1f}"
        lines.append(f"cut {i} at {pc.at_s:.2f}s, {beat}{', CHAPTER CHANGE' if pc.chapter else ''}: "
                     f"{pc.a or 'A'} -> {pc.b or 'B'}\n  measured: {f.summary()}\n  options: {opts}")
    budget = max(1, round(3 * reel_seconds / 15))
    look = (f"The image shows every cut as a pair: A's last frame | B's first frame, labelled by cut number.\n"
            if sheet else "")
    rules = (
        f"Rules: most cuts stay straight cuts on the beat; at most {budget} effect transitions in this "
        f"{reel_seconds:g}s reel, placed on the strongest beats or chapter changes; never the same effect on two "
        "consecutive cuts; at most one AI hero transition (morph, depth_parallax_through, generative) in a reel "
        f"under 20 s; {'a generative transition only for the single hero moment' if generative else 'no generative transitions (disabled)'}. "
        "Choose only from each cut's options (the renderer's own crossfade, whip-left, whip-right, zoom-in and "
        "dip-black may stand for a listed match_dissolve, whip, zoom_through or dark luma_dip); keep their "
        "durations unless the tempo argues for a neighbouring beat fraction. A whip keeps the listed direction "
        "(it continues the measured motion).")
    instructions = (
        "You are choosing the transitions for one Instagram reel, every cut at once. "
        f"{'Tempo ' + format(tempo_bpm, '.0f') + ' bpm. ' if tempo_bpm else ''}"
        f"{look}\nTransition guide:\n{guide_text(style)}\n\nCuts:\n" + "\n".join(lines) + "\n\n" + rules +
        "\nReturn one entry per cut, in order, with a short reason.")
    return JudgeTask(key=f"transitions:{key}", instructions=instructions, output=TransitionPlan,
                     images=[sheet] if sheet else [], effort="medium", max_tokens=6000)


def _available(available, cfg: Config | None) -> frozenset[str]:
    """The kinds the director may offer: given, or what renders at full quality here."""
    return frozenset(available) if available is not None else aitx.available_kinds(cfg)


def enforce(choices: list[CutChoice | None], plan_cuts: list[PlanCut],
            shortlists: list[list[tuple[TransitionSpec, str]]], *, reel_seconds: float = 15.0,
            generative: bool = False) -> list[Transition]:
    """Hold the director's choices to the rules: shortlisted kinds only (durations within half to one
    and a half times the shortlisted one), generative only when enabled, the effect budget (kept on
    the strongest beats), no effect twice in a row, one AI hero per reel under 20 s. A renderer
    built-in (crossfade, whip-left/right, zoom-in, dip-black) is kept when its aitx equivalent was
    shortlisted (a whip only in the measured direction). Returns the wire shape: kind, duration_s,
    params, reason."""
    specs: list[TransitionSpec] = []
    builtin: list[str | None] = []
    for i, sl in enumerate(shortlists):
        c = choices[i] if i < len(choices) else None
        allowed = {s.kind: s for s, _ in sl}
        name = None
        if c is not None and c.kind in aitx.ALIASES and c.kind != "none":
            target, extra = aitx.ALIASES[c.kind]
            if target in allowed and extra.get("direction", allowed[target].direction) == allowed[target].direction:
                name = c.kind
            c = c.model_copy(update={"kind": target})
        builtin.append(name)
        if c is None or c.kind not in allowed or (c.kind == "generative" and not generative):
            if c is not None and c.kind == "generative" and "depth_parallax_through" in allowed:
                c = c.model_copy(update={"kind": "depth_parallax_through"})
            else:
                specs.append(TransitionSpec(kind="cut", reason=(c.reason if c else "") or "default cut"))
                continue
        base = allowed[c.kind]
        if c.kind == "cut":
            specs.append(base.model_copy(update={"reason": c.reason}))
            continue
        d = min(max(c.duration_s, base.duration_s * 0.5), base.duration_s * 1.5)
        d = max(2, 2 * int(round(d * FPS / 2))) / FPS
        upd = {"duration_s": d, "reason": c.reason}
        if c.kind == "whip":
            upd["direction"] = base.direction or c.direction
        specs.append(base.model_copy(update=upd))

    def strength(i):
        pc = plan_cuts[i] if i < len(plan_cuts) else None
        return ((pc.beat_strength or 0) if pc else 0) + (1 if pc and pc.chapter else 0)

    def demote(i, why):
        specs[i] = TransitionSpec(kind="cut", reason=f"{specs[i].kind} dropped: {why}")

    # one AI hero (per 20 s)
    heroes = [i for i, s in enumerate(specs) if s.kind in AI_KINDS]
    keep = max(1, int(reel_seconds // 20) + (reel_seconds % 20 > 0)) if reel_seconds > 20 else 1
    for i in sorted(heroes, key=lambda i: -strength(i))[keep:]:
        alt = next((s for s, _ in shortlists[i] if s.kind == "match_dissolve"), None)
        specs[i] = alt.model_copy(update={"reason": "second AI transition: dissolve instead"}) if alt else \
            TransitionSpec(kind="cut", reason="only one AI hero per reel")
    # never the same effect twice in a row
    for i in range(1, len(specs)):
        if specs[i].kind != "cut" and specs[i].kind == specs[i - 1].kind:
            demote(i, "same effect as the cut before")
    # the effect budget, kept on the strongest beats
    budget = max(1, round(3 * reel_seconds / 15))
    effects = [i for i, s in enumerate(specs) if s.kind != "cut"]
    for i in sorted(effects, key=lambda i: (-strength(i), i))[budget:]:
        demote(i, "over the effect budget")
    out = []
    for s, name in zip(specs, builtin):
        if name and s.kind == aitx.ALIASES[name][0]:
            out.append(Transition(kind=name, duration_s=s.duration_s, reason=s.reason))
        else:
            out.append(s.wire())
    return out


def _shortlists(plan_cuts, features, beat_s, generative, avail):
    return [candidates(f, pc.beat_strength, beat_s=beat_s, chapter=pc.chapter,
                       generative=generative and "generative" in avail, available=avail)
            for pc, f in zip(plan_cuts, features)]


def auto_direct(plan_cuts: list[PlanCut], features: list[CutFeatures], *, beat_s: float | None = None,
                reel_seconds: float = 15.0, generative: bool = False, available=None,
                cfg: Config | None = None) -> list[Transition]:
    """Rules only (no Claude): the first shortlisted effect where the beat is strong or the measured
    reason is compelling (matching frames, a fast exit, a big brightness jump), else a cut."""
    avail = _available(available, cfg)
    shortlists = _shortlists(plan_cuts, features, beat_s, generative, avail)
    choices = []
    for i, (pc, f, sl) in enumerate(zip(plan_cuts, features, shortlists)):
        pick = sl[0][0]
        effects = [s for s, _ in sl[1:]]
        compelling = [s for s in effects if s.kind in ("morph", "whip", "luma_dip", "flash")]
        if compelling:
            pick = compelling[0]
        elif effects and ((pc.beat_strength or 0) >= 0.8 or pc.chapter):
            pick = effects[0]
        choices.append(CutChoice(cut=i, kind=pick.kind, duration_s=pick.duration_s, direction=pick.direction,
                                 reason="rules"))
    return enforce(choices, plan_cuts, shortlists, reel_seconds=reel_seconds,
                   generative=generative and "generative" in avail)


def direct(plan_cuts: list[PlanCut], features: list[CutFeatures], judge, style: str | Path | None = None, *,
           key: str = "reel", reel_seconds: float = 15.0, beat_s: float | None = None, generative: bool = False,
           sheet: Path | None = None, available=None, cfg: Config | None = None) -> list[Transition]:
    """One Claude call for every cut of the reel: measured features, the shortlist per cut and the
    story beats in; one Transition per cut (kind, duration_s, params, reason) out, held to the rules
    by enforce(). Only kinds that render at full quality are offered (available, default
    aitx.available_kinds(cfg)): without RIFE a morph is never offered and a match dissolve is.
    A failed call falls back to auto_direct (rules only), so a reel never waits on this."""
    if len(plan_cuts) != len(features):
        raise ValueError(f"{len(plan_cuts)} cuts but {len(features)} feature sets")
    if not plan_cuts:
        return []
    avail = _available(available, cfg)
    gen = generative and "generative" in avail
    shortlists = _shortlists(plan_cuts, features, beat_s, generative, avail)
    task = direction_task(key, plan_cuts, features, shortlists, style=style, reel_seconds=reel_seconds,
                          tempo_bpm=60 / beat_s if beat_s else None, generative=gen, sheet=sheet)
    try:
        answer: TransitionPlan = judge.judge(task)
    except JudgeError as e:
        log.warning("transition direction failed (%s); using the rules", e)
        return auto_direct(plan_cuts, features, beat_s=beat_s, reel_seconds=reel_seconds, generative=generative,
                           available=avail)
    by_cut = {c.cut: c for c in answer.cuts}
    return enforce([by_cut.get(i) for i in range(len(plan_cuts))], plan_cuts, shortlists,
                   reel_seconds=reel_seconds, generative=gen)


def direct_many(reels: dict[str, tuple[list[PlanCut], list[CutFeatures]]], judge, style: str | Path | None = None,
                *, reel_seconds: float = 15.0, beat_s: dict[str, float | None] | None = None,
                generative: bool = False, available=None, cfg: Config | None = None) -> dict[str, list[Transition]]:
    """direct() for several reels in one judge_many: still one call per reel, but the API backend
    sends them as a single Message Batch and the plan backend runs them in parallel."""
    beat_s = beat_s or {}
    avail = _available(available, cfg)
    gen = generative and "generative" in avail
    tasks, shortlists = [], {}
    for key, (pcs, feats) in reels.items():
        b = beat_s.get(key)
        shortlists[key] = _shortlists(pcs, feats, b, generative, avail)
        tasks.append(direction_task(key, pcs, feats, shortlists[key], style=style, reel_seconds=reel_seconds,
                                    tempo_bpm=60 / b if b else None, generative=gen))
    answers = judge.judge_many(tasks) if tasks else {}
    out = {}
    for key, (pcs, feats) in reels.items():
        ans = answers.get(f"transitions:{key}")
        if not isinstance(ans, TransitionPlan):
            out[key] = auto_direct(pcs, feats, beat_s=beat_s.get(key), reel_seconds=reel_seconds,
                                   generative=generative, available=avail)
            continue
        by_cut = {c.cut: c for c in ans.cuts}
        out[key] = enforce([by_cut.get(i) for i in range(len(pcs))], pcs, shortlists[key],
                           reel_seconds=reel_seconds, generative=gen)
    return out


def boundary_sheet(segments: list[str | Path], out: str | Path, cfg: Config, thumb_w: int = 160) -> Path:
    """Every cut as a pair (A's last frame | B's first frame), for the director to look at."""
    th = int(round(thumb_w * 16 / 9))
    pairs = []
    for i in range(len(segments) - 1):
        ia, ib = aitx.probe_segment(segments[i], cfg), aitx.probe_segment(segments[i + 1], cfg)
        a = aitx.read_frames(segments[i], ia.frames - 1, 1, cfg, ia, size=(thumb_w, th))[0]
        b = aitx.read_frames(segments[i + 1], 0, 1, cfg, ib, size=(thumb_w, th))[0]
        pairs.append((a, b))
    cols = min(4, max(1, len(pairs)))
    rows = math.ceil(len(pairs) / cols)
    cw, ch = 2 * thumb_w + 18, th + 26
    sheet = Image.new("RGB", (cols * cw, rows * ch), (24, 24, 24))
    draw = ImageDraw.Draw(sheet)
    for k, (a, b) in enumerate(pairs):
        x, y = (k % cols) * cw + 6, (k // cols) * ch + 22
        sheet.paste(Image.fromarray(aitx._u8(aitx._f(a))), (x, y))
        sheet.paste(Image.fromarray(aitx._u8(aitx._f(b))), (x + thumb_w + 4, y))
        draw.text((x, y - 18), f"cut {k}", fill=(255, 220, 120), font=aitx._font(14))
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out, quality=85)
    return out
