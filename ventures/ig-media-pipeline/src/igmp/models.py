"""Data shared between stages, and the JSON shapes Claude is asked to return."""
from __future__ import annotations

import copy
from datetime import datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field

Kind = Literal["photo", "video", "photo360", "video360", "sequence"]


class Asset(BaseModel):
    """One shot: a RAW+JPG pair, a 360 photo with its DNG, or one video clip."""
    id: str
    kind: Kind
    files: list[str]                    # every file that belongs to the shot
    preview: str | None = None          # camera JPG/INSP, or the video itself
    raw: str | None = None              # ARW/DNG when there is one
    taken_at: datetime | None = None    # local time where it was shot
    date_label: str = ""                # YYYY-MM-DD, or YYYY-MM-xx when the day is unknown
    location: str = ""
    event: str = ""
    camera: str = ""
    duration_s: float | None = None
    # sequence only: the photos of an intervalometer run (timelapse or stop-motion), in order
    members: list[str] = []
    interval_s: float | None = None
    # camera clock time when the local time is unknown (zone not yet known): orders shots
    clock_time: datetime | None = None

    @property
    def event_key(self) -> str:
        """The unit a reel is built from: one place, one event, one day. Shots before 5 am belong
        to the evening before, so a night shoot that runs past midnight stays one event."""
        day = (self.taken_at - timedelta(hours=5)).strftime("%Y-%m-%d") if self.taken_at else self.date_label
        return "_".join(p for p in (day, self.location, self.event) if p)


class Metrics(BaseModel):
    """Cheap local measurements used to skip obvious rejects before Claude sees anything."""
    asset_id: str
    sharpness: float                    # variance of the Laplacian on a 1024px grey preview
    brightness: float                   # mean 0..1
    clipped_high: float                 # share of pixels at the top
    clipped_low: float
    dhash: str                          # 64-bit difference hash, hex
    burst_id: str = ""                  # assets that are near-duplicates share one
    candidate: bool = True              # best of its burst and not technically broken
    segments: list[tuple[float, float]] = []   # video only: usable stretches (seconds)
    # Apple Vision, on-device and free (None when it hasn't run, or off macOS)
    aesthetics: float | None = None     # overall aesthetics score, -1..1
    utility: bool | None = None         # screenshot/receipt/document-like, not a photograph to post
    faces: int = 0
    face_quality: float | None = None   # best face capture quality 0..1 (sharp, eyes open, well lit)
    face_quality_min: float | None = None   # worst face: one blink in a group shot pulls this down
    labels: list[str] = []              # scene classification, most confident first
    feature_print: str = ""             # base64 float32 vector for semantic near-duplicate checks


class Point(BaseModel):
    x: float = Field(ge=0, le=1, description="0 = left edge, 1 = right edge")
    y: float = Field(ge=0, le=1, description="0 = top edge, 1 = bottom edge")


class Score(BaseModel):
    """Taste judgment for one asset (a still, a 360 view, or a video's keyframes)."""
    score: float = Field(ge=0, le=10, description="How strongly this belongs in a curated Instagram feed")
    keep: bool
    role: Literal["hook", "establishing", "moment", "detail", "portrait", "closer", "skip"]
    subject: str = Field(description="What the frame is of, in a few words; no names of people")
    mood: str
    vertical_focus: Point = Field(description="Centre of the best 9:16 crop")
    feed_focus: Point = Field(description="Centre of the best 4:5 crop")
    best_in_s: float | None = Field(None, description="Video only: start of the best moment")
    best_out_s: float | None = Field(None, description="Video only: end of the best moment")
    view_yaw_deg: float | None = Field(None, description="360 only: direction to look, -180..180")
    sequence_style: Literal["timelapse", "stop-motion", "not-a-sequence"] | None = Field(
        None, description="Sequence only: what the run of evenly spaced photos was meant to be")
    sequence_fps: int | None = Field(None, description="Sequence only: playback rate, 24-30 timelapse, 8-12 stop-motion")
    sequence_from: int | None = Field(None, description="Sequence only: first frame index of the best stretch")
    sequence_to: int | None = Field(None, description="Sequence only: last frame index of the best stretch")
    issues: list[str] = []
    edit_notes: str = ""


class EditParams(BaseModel):
    """A global RAW edit. Ranges match what RawTherapee accepts after mapping."""
    exposure_ev: float = Field(0, ge=-3, le=3)
    temperature_k: int | None = Field(None, ge=2000, le=12000, description="None keeps camera white balance")
    tint: float = Field(1.0, ge=0.5, le=1.5, description="1.0 neutral, below = magenta, above = green")
    contrast: int = Field(0, ge=-50, le=50)
    highlights: int = Field(0, ge=0, le=100, description="Highlight recovery strength")
    shadows: int = Field(0, ge=0, le=100, description="Shadow lift strength")
    black_point: int = Field(0, ge=-200, le=200)
    vibrance: int = Field(0, ge=-50, le=50)
    saturation: int = Field(0, ge=-50, le=50)
    sharpening: int = Field(100, ge=0, le=300)
    noise_reduction: int = Field(0, ge=0, le=100)
    straighten_deg: float = Field(0, ge=-10, le=10)
    aspect: Literal["4:5", "1:1", "1.91:1"] = Field(
        "4:5", description="Feed shape: 4:5 portrait (most screen) unless it would cut the composition; "
                           "1:1 or wide 1.91:1 for landscapes that need their width")
    crop_focus: Point = Point(x=0.5, y=0.5)
    crop_zoom: float = Field(1.0, ge=1.0, le=2.0, description="1.0 = largest crop of the target aspect")
    rationale: str = ""


class EditReview(BaseModel):
    """The edit critic. A frame ships only when every check passes."""
    better_than_camera: bool
    exposure_ok: bool = Field(description="Subject well exposed, highlights held, blacks black")
    color_ok: bool = Field(description="Skin natural, casts corrected, mood of the light kept")
    crop_ok: bool = Field(description="Subject placed well, nothing cut at joints, horizon level")
    notes: str
    verdict: Literal["ship", "revise", "reject"]
    revised: EditParams | None = None

    @property
    def passes(self) -> bool:
        return self.better_than_camera and self.exposure_ok and self.color_ok and self.crop_ok


class Curation(BaseModel):
    """The selection critic's pass over one event's keepers, before any RAW editing."""
    drop: list[str] = Field(description="Ids to drop: near-repeats of a better frame, or too weak for the feed")
    notes: str


class Shot(BaseModel):
    asset_id: str
    start_s: float = Field(0, ge=0, description="Video: where in the clip to start")
    duration_s: float = Field(ge=0.3, le=6)
    focus: Point = Point(x=0.5, y=0.5)
    zoom_from: float = Field(1.0, ge=1.0, le=1.6)
    zoom_to: float = Field(1.08, ge=1.0, le=1.6)
    view_yaw_deg: float | None = None
    layout: Literal["fill", "fit"] = Field(
        "fill", description="fill: a 9:16 crop around focus; fit: the whole frame at full width over a "
                            "blurred copy of itself - for wide shots whose composition a crop would cut")
    focus_to: Point | None = Field(
        None, description="fill only: the crop centre moves from focus to here over the shot (a slow pan "
                          "across a wide landscape); null keeps it still")
    transition: Literal["cut", "crossfade", "whip-left", "whip-right", "zoom-in", "dip-black", "wipe", "morph",
                        "zoom-through", "flash", "ramp-cut"] = Field(
        "cut", description="How this shot arrives from the previous one; mostly cuts on the beat, a few motivated "
                           "transitions (a whip on a fast move, a crossfade on a mood change, zoom-in through to "
                           "a new place, dip-black between chapters of a long reel; 'wipe' is the before/after "
                           "reveal from a camera version to the edit of the same frame; 'morph' melts one frame "
                           "into a similar one (match cut on shape), 'zoom-through' pushes through the depth of "
                           "the outgoing shot into the next place, 'flash' is a white luma dip on a hit, "
                           "'ramp-cut' speeds the outgoing clip into the cut). Ignored on shot 1")
    speed: float = Field(1.0, ge=0.25, le=4.0, description="Video only: 1 normal, below 1 slow motion, above 1 "
                                                          "faster (speed ramps); stills ignore it")
    speed_to: float | None = Field(
        None, ge=0.25, le=4.0, description="Video only: a speed ramp from `speed` at the start of the shot to "
                                           "this at its end (eased), e.g. 1.0 -> 0.4 into a peak moment or 2.0 -> "
                                           "1.0 arriving at a stop; null keeps the speed constant")
    version: Literal["edit", "camera"] = Field(
        "edit", description="Photo only: 'camera' shows the camera's own JPEG instead of the RAW edit - the "
                            "'before' half of a before/after reveal (the next shot is the same id, 'edit', "
                            "arriving with transition 'wipe')")
    view: Literal["flat", "tiny-planet"] = Field(
        "flat", description="360 only: 'tiny-planet' is the little-planet (stereographic, looking down) view, "
                            "an opener or closer")
    view_yaw_to: float | None = Field(
        None, description="360 only: the view turns from view_yaw_deg to this over the shot (a spin); null holds")


class MusicChoice(BaseModel):
    track_id: str = Field(description="Id of a track from the music library listing")
    start_s: float = Field(0, ge=0, description="Where in the track the reel starts (on a beat)")


REEL_FORMATS = ("story", "photo-dump", "shot-vs-scene", "before-after", "day-to-night", "road-trip",
                "city-night", "360-moves", "awe-loop", "recap")


class ReelPlan(BaseModel):
    event_key: str
    length_class: Literal["short", "medium", "long"] = "short"
    format: Literal["story", "photo-dump", "shot-vs-scene", "before-after", "day-to-night", "road-trip",
                    "city-night", "360-moves", "awe-loop", "recap"] = Field(
        "story", description="The reel's format (see the style guide); the posting queue mixes formats")
    title: str = ""
    shots: list[Shot]
    cover_asset_id: str
    caption: str = Field(description="One or two lines; no hashtags, no names of people")
    music: MusicChoice | None = Field(None, description="Null when music is added later in the app")


class SlotPlan(BaseModel):
    slot: str = Field(description="The slot this plan fills, exactly as named in the request, e.g. 'short-02'")
    plan: ReelPlan


class ReelSet(BaseModel):
    """One story pass for several reels of an event: the main edit and the cut-downs derived from it."""
    reels: list[SlotPlan] = Field(description="One plan per requested slot, in the order requested")


class Critique(BaseModel):
    """The reel critic. A reel ships only when every check passes."""
    hook_ok: bool = Field(description="The first second earns a pause")
    all_sharp: bool = Field(description="Every shot sharp and well exposed")
    no_redundancy: bool = Field(description="No two adjacent shots near-identical")
    crops_safe: bool = Field(description="Subject never cut off or under the top/bottom UI bands")
    pacing_ok: bool = Field(description="Cuts on the beat, one place to breathe, no shot overstays")
    ending_ok: bool = Field(description="The last shot lands and loops back")
    arc_ok: bool = Field(True, description=(
        "short: one clear idea from hook to closer, from a different angle than the event's other reels; "
        "medium: a story arc (hook, place, build, a breath, payoff, closer); long: a cold-open hook, then "
        "chapters with changes of pace, and no sag in the middle third"))
    transitions_ok: bool = Field(True, description=(
        "Every transition that is not a hard cut is motivated (a whip on a fast move, a crossfade on a change "
        "of mood or time, a dip to black between chapters) and none looks gimmicky; true when all are cuts"))
    slowmo_ok: bool = Field(True, description=(
        "Slow motion and speed changes look clean (no warping, ghosting or judder) and serve a moment; "
        "true when there are none"))
    score: float = Field(ge=0, le=10)
    notes: str
    verdict: Literal["ship", "revise"]
    revised: ReelPlan | None = None

    @property
    def passes(self) -> bool:
        return all((self.hook_ok, self.all_sharp, self.no_redundancy, self.crops_safe,
                    self.pacing_ok, self.ending_ok, self.arc_ok, self.transitions_ok, self.slowmo_ok))


def strict_schema(model: type[BaseModel]) -> dict:
    """JSON schema in the strict form structured outputs want: refs inlined, every field
    required, no extra keys. Optional fields stay nullable, so "required" costs nothing."""
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    def walk(node):
        if isinstance(node, dict):
            if "$ref" in node:
                return walk(copy.deepcopy(defs[node["$ref"].split("/")[-1]]))
            node = {k: walk(v) for k, v in node.items() if k not in ("default", "title")}
            if node.get("type") == "object" and "properties" in node:
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            # numeric bounds are enforced by pydantic on our side
            for k in ("minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"):
                node.pop(k, None)
            return node
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


class CarouselFrame(BaseModel):
    """One slide of a carousel. Every slide is 4:5 portrait (1080x1350)."""
    frame_id: str = Field(description="A candidate's id, exactly as listed")
    layout: Literal["fill", "fit"] = Field(
        "fill", description="fill: the slide is a 4:5 crop around focus (the normal case); fit: the whole picture "
                            "at full width over a blurred copy of itself - at most one slide per carousel, only for "
                            "a frame whose subject a 4:5 crop would cut. 360 views and tiny planets: fill")
    focus: Point | None = Field(
        None, description="fill only: centre of the 4:5 crop as fractions of the whole picture; null keeps the "
                          "marked crop")
    view_yaw_deg: float | None = Field(
        None, description="360 views and tiny planets only: direction to look (-180..180); null keeps the listed one")


class CarouselPlan(BaseModel):
    event_key: str
    style: Literal["story", "photo-dump", "before-after"] = Field(
        "story", description="story: 5-10 slides that tell the event; photo-dump: a looser set of up to 20; "
                             "before-after: 2-4 photos, each shown as its camera JPEG then its RAW edit")
    frames: list[CarouselFrame] = Field(description="Slides in swipe order: slide 1 opens the loop, the last closes "
                                                    "it (before-after: each photo once, in order)")
    caption: str = Field(description="First line specific and keyword-rich (place, what it is, when); then one or "
                                     "two lines of story or a tip; then 3-5 relevant hashtags. No names of people")


class CarouselCritique(BaseModel):
    """The carousel critic. A carousel ships only when every check passes."""
    hook_ok: bool = Field(description="Slide 1 is striking and gives a reason to swipe")
    cover_ok: bool = Field(description="Slide 1 works as the profile-grid cover: its subject inside the centre 3:4")
    scale_varied: bool = Field(description="Wide, medium and detail frames: not one scale throughout")
    no_near_duplicates: bool = Field(description="No two slides (pairs, for a before/after) show nearly the same "
                                                 "picture")
    colour_consistent: bool = Field(description="White balance, contrast and grade read as one set")
    crops_ok: bool = Field(description="Every slide fills the frame and keeps its subject whole: no cut heads, "
                                       "buildings or horizons; at most one blurred-background slide")
    closer_ok: bool = Field(description="The last slide lands: the best frame or a strong detail")
    caption_ok: bool = Field(description="First line names the place, the subject and when; one or two lines of "
                                         "story or a tip; 3-5 relevant hashtags; no names")
    score: float = Field(ge=0, le=10)
    notes: str
    verdict: Literal["ship", "revise"]
    revised: CarouselPlan | None = None

    @property
    def passes(self) -> bool:
        return all((self.hook_ok, self.cover_ok, self.scale_varied, self.no_near_duplicates,
                    self.colour_consistent, self.crops_ok, self.closer_ok, self.caption_ok))
