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


class MusicChoice(BaseModel):
    track_id: str = Field(description="Id of a track from the music library listing")
    start_s: float = Field(0, ge=0, description="Where in the track the reel starts (on a beat)")


class ReelPlan(BaseModel):
    event_key: str
    title: str = ""
    shots: list[Shot]
    cover_asset_id: str
    caption: str = Field(description="One or two lines; no hashtags, no names of people")
    music: MusicChoice | None = Field(None, description="Null when music is added later in the app")


class Critique(BaseModel):
    """The reel critic. A reel ships only when every check passes."""
    hook_ok: bool = Field(description="The first second earns a pause")
    all_sharp: bool = Field(description="Every shot sharp and well exposed")
    no_redundancy: bool = Field(description="No two adjacent shots near-identical")
    crops_safe: bool = Field(description="Subject never cut off or under the top/bottom UI bands")
    pacing_ok: bool = Field(description="Cuts on the beat, one place to breathe, no shot overstays")
    ending_ok: bool = Field(description="The last shot lands and loops back")
    score: float = Field(ge=0, le=10)
    notes: str
    verdict: Literal["ship", "revise"]
    revised: ReelPlan | None = None

    @property
    def passes(self) -> bool:
        return all((self.hook_ok, self.all_sharp, self.no_redundancy, self.crops_safe,
                    self.pacing_ok, self.ending_ok))


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
