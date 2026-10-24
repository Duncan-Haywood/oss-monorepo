"""Apple Vision on-device signals: free, local, and good enough to cut what reaches Claude.

Per asset, on media's cached 1024px preview:

* aesthetics   - VNCalculateImageAestheticsScoresRequest overallScore, -1..1 (macOS 15+).
                 Generic "is this a nice photo": night skies, astro and moody low-key frames
                 score low (often < 0), so prefilter uses it as a tie-breaker and rejects only
                 extreme junk. It is also jumpy: borderline frames snap to ~-0.03 (a junk gate
                 inside the model) where a near-identical frame scores ~0.45.
* utility      - the same request's isUtility: meant for screenshots, receipts, documents;
                 on a camera library it mostly fires on shop displays and signs, so prefilter
                 only trusts it together with a document/screen label.
* faces        - faces at least MIN_FACE_HEIGHT of the frame tall (VNDetectFaceCaptureQualityRequest),
  face_quality   and the best faceCaptureQuality among them (0..1: sharp, eyes open, well lit).
* labels       - VNClassifyImageRequest identifiers with confidence > LABEL_MIN_CONFIDENCE,
                 most confident first, at most MAX_LABELS. The taxonomy is hierarchical, so
                 "sky" and "night_sky" usually come together with the same confidence.
* feature_print- VNGenerateImageFeaturePrintRequest (revision 2: 768 floats, unit length),
                 stored as base64 float32. `distance` is Vision's computeDistance: the plain
                 Euclidean distance between the vectors (checked against
                 VNFeaturePrintObservation.computeDistance to ~1e-7 on real photos).

What is analysed, by kind:

* photo     - the preview as is.
* photo360  - the top 2:1 equirect panorama of media's 360 sheet (not the yaw scale or the
              flat views under it).
* video     - the middle cell of the 8-frame contact sheet (the frame ~56% into the clip), with
              faces: cells are 450-512 px on the long edge, big enough for face quality.
* video360  - the middle cell of the 360 contact sheet: four 128 px flat views side by side
              (the whole surroundings at mid-clip). Faces are skipped: at 128 px a face is
              ~10-30 px, too small for capture quality to mean anything.
* sequence  - no image of its own: the Vision fields of its middle member photo are copied.

Everything imports on Linux without pyobjc; `available()` says whether Vision can run.
"""
from __future__ import annotations

import base64
import logging
import math
import multiprocessing
from collections.abc import Callable, Sequence
from concurrent.futures import ProcessPoolExecutor, as_completed
from concurrent.futures.process import BrokenProcessPool
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image

from .config import Config
from .models import Asset, Metrics

log = logging.getLogger("igmp")

# --- what is kept ------------------------------------------------------------------------
LABEL_MIN_CONFIDENCE = 0.3  # Vision's own "probably present" point; below it labels are guesses ("document" at 0.02)
MAX_LABELS = 8              # the taxonomy is a tree, so 8 identifiers are ~3-4 distinct concepts
MIN_FACE_HEIGHT = 0.05      # of the analysed frame: Vision finds none under ~0.03; at 0.03-0.05 quality is noise (median 0.17)
FEATURE_PRINT_REVISION = 2  # 768-d unit vectors; revision 1 prints are 2048-d on another scale

# --- input geometry (mirrors media's previews) --------------------------------------------
CONTACT_FRAMES = 8          # media.CONTACT_FRAMES: frames on a video contact sheet
V360_VIEWS = 4              # media: each 360 cell is 4 flat views (yaw 0/90/180/-90) side by side
V360_COLUMNS = 2            # media: two cells per row
PANORAMA_ASPECT = 2.0       # equirect

# --- batch -------------------------------------------------------------------------------
# Measured on an M1 Max (macOS 26.5), 400 cached 1024px previews, all four requests per image:
#   1 thread 23-33 img/s; 2 threads 42; 4 threads 51-70; 12 threads DEADLOCK (every thread
#   parked in VNCalculateImageAestheticsScoresRequest -> VNControlledCapacityTasksQueue);
#   processes: 2 -> 62, 4 -> 89-97, 6 -> 108, 8 -> 108 img/s.
# Full pass over 9,546 cached previews on the external SSD, 6 workers: 83-88 s = 108-115 img/s.
# So: single-threaded spawn workers (one Vision instance each, no shared queue to deadlock on),
# 6 of them - the Neural Engine is saturated beyond that. Vision has no batch API for these
# requests (one VNImageRequestHandler per image), so there is nothing to batch.
WORKERS = 6
INLINE_MAX = 4              # below this many images a worker's start-up (~1 s: import + model load) costs more

VISION_FIELDS = ("aesthetics", "utility", "faces", "face_quality", "face_quality_min", "labels", "feature_print")


class VisionError(RuntimeError):
    """An image Vision could not read or analyse."""


# --- availability ------------------------------------------------------------------------

@lru_cache(maxsize=1)
def available() -> bool:
    """True when Apple Vision can run here (macOS with pyobjc-framework-Vision and -Quartz)."""
    try:
        import Quartz  # noqa: F401
        import Vision
    except Exception:       # ImportError off macOS; anything else means a broken install
        return False
    return hasattr(Vision, "VNImageRequestHandler")


# --- feature prints ----------------------------------------------------------------------

def encode_print(vector: np.ndarray | Sequence[float] | bytes) -> str:
    """Base64 of the vector as little-endian float32 (raw bytes are taken as float32 already)."""
    if isinstance(vector, (bytes, bytearray, memoryview)):
        raw = bytes(vector)
    else:
        raw = np.asarray(vector, dtype="<f4").tobytes()
    return base64.b64encode(raw).decode("ascii")


def decode_print(text: str) -> np.ndarray:
    """The float32 vector of an encoded feature print (empty for "")."""
    if not text:
        return np.zeros(0, np.float32)
    return np.frombuffer(base64.b64decode(text), dtype="<f4")


def distance(print_a: str | np.ndarray, print_b: str | np.ndarray) -> float:
    """Vision's VNFeaturePrintObservation.computeDistance: Euclidean distance between the two
    vectors. For revision 2 prints (unit length) 0 is identical, ~0.1-0.3 the same scene, ~1
    unrelated, and sqrt(2) orthogonal. inf when either is missing or they differ in length
    (different revisions are not comparable)."""
    a = decode_print(print_a) if isinstance(print_a, str) else np.asarray(print_a, np.float32)
    b = decode_print(print_b) if isinstance(print_b, str) else np.asarray(print_b, np.float32)
    if a.size == 0 or a.shape != b.shape:
        return math.inf
    return float(np.linalg.norm(a.astype(np.float64) - b.astype(np.float64)))


# --- regions -----------------------------------------------------------------------------

def region_for(kind: str, width: int, height: int) -> tuple[int, int, int, int] | None:
    """(x, y, w, h) in pixels, top-left origin, of the part of a preview to analyse; None = all."""
    if kind == "photo360":
        if abs(width - PANORAMA_ASPECT * height) <= 2:
            return None
        return 0, 0, width, min(height, round(width / PANORAMA_ASPECT))
    if kind == "video":
        return _contact_cell(width, height)
    if kind == "video360":
        return _v360_cell(width, height)
    return None


def _contact_cell(width: int, height: int, n: int = CONTACT_FRAMES) -> tuple[int, int, int, int]:
    """The middle frame of a video contact sheet: n equal tiles in a grid without empty cells.

    The sheet's size alone fixes the layout for ordinary frames: of the possible grids, the
    one whose tiles are closest to square-ish (|log aspect| smallest) is the one media built
    (16:9 frames: 2 columns x 4 rows; 9:16: 4 x 2; 4:3 and 1:1 likewise). Only very wide
    frames (2.4:1 and up) would be mistaken, and our cameras do not shoot those.
    """
    layouts = [(c, n // c) for c in range(1, n + 1) if n % c == 0]
    cols, rows = min(layouts, key=lambda cr: abs(math.log((width / cr[0]) / (height / cr[1]))))
    i = n // 2
    cw, ch = width / cols, height / rows
    x, y = (i % cols) * cw, (i // cols) * ch
    return round(x), round(y), round(cw), round(ch)


def _v360_cell(width: int, height: int, n: int = CONTACT_FRAMES) -> tuple[int, int, int, int]:
    """The middle cell (all four flat views) of a 360 contact sheet: a header strip, then rows
    of V360_COLUMNS cells, each V360_VIEWS square views wide plus a 2 px gap under it."""
    side = width / (V360_COLUMNS * V360_VIEWS)
    rows = math.ceil(n / V360_COLUMNS)
    top = max(0.0, height - rows * (side + 2))
    i = n // 2
    x = (i % V360_COLUMNS) * V360_VIEWS * side
    y = top + (i // V360_COLUMNS) * (side + 2)
    return round(x), round(y), round(V360_VIEWS * side), round(side)


# --- analysis ----------------------------------------------------------------------------

def _request(name: str):
    import Vision
    cls = getattr(Vision, name, None)
    return cls.alloc().init() if cls is not None else None


def load_region(path: Path, kind: str) -> Image.Image:
    """The RGB pixels of `path` that are analysed for an asset of `kind`, decoded by Pillow.

    Pillow (libjpeg) decodes the same file to the same pixels every time. ImageIO does not:
    depending on load it takes the hardware or the software JPEG decoder, which differ by up
    to 12 levels, and that alone moved feature prints by 0.03-0.05 and flipped the aesthetics
    of borderline night frames between ~0.45 and ~-0.03 between two runs on the same file.
    """
    try:
        with Image.open(path) as im:
            im = im.convert("RGB")
    except (OSError, ValueError, Image.DecompressionBombError) as e:
        raise VisionError(f"cannot decode {path}: {e}") from e
    region = region_for(kind, *im.size)
    if region is not None:
        x, y, w, h = region
        im = im.crop((x, y, x + w, y + h))
    return im


def _cgimage(im: Image.Image):
    """A CGImage over the RGB pixels of `im` (sRGB, as media writes every preview)."""
    import Quartz
    from Foundation import NSData

    w, h = im.size
    raw = im.tobytes("raw", "RGBX")
    provider = Quartz.CGDataProviderCreateWithCFData(NSData.dataWithBytes_length_(raw, len(raw)))
    image = Quartz.CGImageCreate(w, h, 8, 32, 4 * w, Quartz.CGColorSpaceCreateWithName(Quartz.kCGColorSpaceSRGB),
                                 Quartz.kCGImageAlphaNoneSkipLast, provider, None, False,
                                 Quartz.kCGRenderingIntentDefault)
    if image is None:
        raise VisionError(f"cannot wrap a {w}x{h} image for Vision")
    return image


def analyze(image_path: str | Path, kind: str = "photo") -> dict:
    """Vision fields for one image, keyed like Metrics: aesthetics, utility, faces,
    face_quality, labels, feature_print. `kind` picks the region (see the module docstring);
    a request this macOS lacks leaves its field at the Metrics default. Raises VisionError
    when the image cannot be read or no request produced anything."""
    import objc
    import Vision

    path = Path(image_path)
    if not path.is_file():
        raise VisionError(f"no such image: {path}")
    pixels = load_region(path, kind)
    with objc.autorelease_pool():       # free each image's Vision objects right away
        image = _cgimage(pixels)
        aesthetics = _request("VNCalculateImageAestheticsScoresRequest")   # macOS 15+
        faces = _request("VNDetectFaceCaptureQualityRequest") if kind != "video360" else None
        classify = _request("VNClassifyImageRequest")
        fprint = _request("VNGenerateImageFeaturePrintRequest")
        if fprint is not None and FEATURE_PRINT_REVISION in _supported(fprint):
            fprint.setRevision_(FEATURE_PRINT_REVISION)
        requests = [r for r in (aesthetics, faces, classify, fprint) if r is not None]
        handler = Vision.VNImageRequestHandler.alloc().initWithCGImage_options_(image, {})
        ok, error = handler.performRequests_error_(requests, None)
        out = _collect(aesthetics, faces, classify, fprint)
    if not ok and not any(out.get(k) not in (None, [], "", 0) for k in VISION_FIELDS):
        raise VisionError(f"Vision failed on {path}: {error}")
    return out


def _supported(request) -> set[int]:
    try:
        return {int(r) for r in type(request).supportedRevisions()}
    except Exception:
        return set()


def _collect(aesthetics, faces, classify, fprint) -> dict:
    out: dict = {"aesthetics": None, "utility": None, "faces": 0, "face_quality": None,
                 "labels": [], "feature_print": ""}
    results = (aesthetics.results() if aesthetics is not None else None) or []
    if results:
        out["aesthetics"] = round(float(results[0].overallScore()), 4)
        out["utility"] = bool(results[0].isUtility())
    found = [f for f in ((faces.results() if faces is not None else None) or [])
             if f.boundingBox().size.height >= MIN_FACE_HEIGHT]
    out["faces"] = len(found)
    qualities = [float(q) for q in (f.faceCaptureQuality() for f in found) if q is not None]
    out["face_quality"] = round(max(qualities), 4) if qualities else None
    out["face_quality_min"] = round(min(qualities), 4) if qualities else None
    ranked = sorted(((float(c.confidence()), str(c.identifier()))
                     for c in ((classify.results() if classify is not None else None) or [])),
                    key=lambda ci: (-ci[0], ci[1]))
    out["labels"] = [name for conf, name in ranked if conf > LABEL_MIN_CONFIDENCE][:MAX_LABELS]
    prints = (fprint.results() if fprint is not None else None) or []
    if prints:
        p = prints[0]
        dtype = np.float32 if int(p.elementType()) == 1 else np.float64    # VNElementTypeFloat = 1
        out["feature_print"] = encode_print(np.frombuffer(bytes(p.data()), dtype=dtype))
    return out


def analyze_asset(asset: Asset, cfg: Config) -> dict:
    """analyze() on the asset's cached preview (made by media.preview_image when missing)."""
    from . import media     # late: media pulls in ffmpeg plumbing

    return analyze(media.preview_image(asset, cfg), asset.kind)


# --- the pass ----------------------------------------------------------------------------

def done(m: Metrics) -> bool:
    """Vision has run on this record (aesthetics needs macOS 15; the print is there since 10.15)."""
    return m.aesthetics is not None or bool(m.feature_print)


def _middle_member(seq: Asset, metrics: dict[str, Metrics]) -> Metrics | None:
    """The analysed member closest to the middle of a sequence."""
    members = [mid for mid in seq.members if mid in metrics and done(metrics[mid])]
    return metrics[members[len(members) // 2]] if members else None


def vision_pass(cfg: Config, store, assets: Sequence[Asset], workers: int | None = None,
                progress: Callable[[int, int], object] | None = None) -> int:
    """Fill the Vision fields of every stored Metrics that has none yet; returns how many
    records were updated.

    Resumable: records that already have Vision fields are skipped, each result is written as
    soon as it is ready, and a file that fails is recorded in store "jobs" as "vision:<id>"
    and not retried (delete that job row to retry). Assets without metrics, and those
    prefilter calls technically broken (unreadable, black, white, a clip with nothing usable:
    never candidates), are skipped. Sequences copy their middle member's fields, so
    they are filled after their members. Off macOS (or without pyobjc) it does nothing.
    Workers are spawned processes, so the calling script's main module must be import-safe
    (`if __name__ == "__main__":`), as for any process pool here.
    """
    if not available():
        log.info("vision: Apple Vision not available here, skipping")
        return 0
    todo: list[Asset] = []
    sequences: list[Asset] = []
    for a in assets:
        m = store.get("metrics", a.id, Metrics)
        if m is None or done(m):
            continue
        if a.kind == "sequence":
            sequences.append(a)
        elif not _hard_broken(a, m) and not store.has("jobs", f"vision:{a.id}"):
            todo.append(a)
    log.info("vision: analysing %d assets", len(todo))
    updated = 0
    total = len(todo)

    def record(asset: Asset, result: dict | str) -> None:
        nonlocal updated
        if isinstance(result, str):
            store.put("jobs", f"vision:{asset.id}", {"error": result})
            return
        current = store.get("metrics", asset.id, Metrics)    # re-read: keep other stages' fields
        if current is not None:
            store.put("metrics", asset.id, current.model_copy(update=result))
            updated += 1

    workers = max(1, min(workers or WORKERS, total))
    if workers == 1 or total <= INLINE_MAX:
        for count, a in enumerate(todo, 1):
            record(a, _analyze_safe(a, cfg))
            if progress:
                progress(count, total)
    elif todo:
        # spawn, never fork: forking a process that has loaded Vision/ObjC is unsafe
        ctx = multiprocessing.get_context("spawn")
        with ProcessPoolExecutor(max_workers=workers, mp_context=ctx) as pool:
            futures = {pool.submit(_analyze_safe, a, cfg): a for a in todo}
            try:
                for count, fut in enumerate(as_completed(futures), 1):
                    record(futures[fut], fut.result())
                    if progress:
                        progress(count, total)
            except BrokenProcessPool:       # a worker died inside Vision: keep what is written
                log.warning("vision: a worker crashed; %d of %d done, the rest resume next run",
                            updated, total)
    updated += _fill_sequences(store, sequences)
    log.info("vision: %d records updated", updated)
    return updated


def _hard_broken(asset: Asset, m: Metrics) -> bool:
    from .prefilter import _hard_broken as broken     # late: prefilter imports this module too

    return broken(asset, m)


def _fill_sequences(store, sequences: Sequence[Asset]) -> int:
    n = 0
    for seq in sequences:
        member_metrics = {mid: m for mid in seq.members
                          if (m := store.get("metrics", mid, Metrics)) is not None}
        src = _middle_member(seq, member_metrics)
        current = store.get("metrics", seq.id, Metrics)
        if src is None or current is None:
            continue
        store.put("metrics", seq.id, current.model_copy(
            update={k: getattr(src, k) for k in VISION_FIELDS}, deep=True))
        n += 1
    return n


def _analyze_safe(asset: Asset, cfg: Config) -> dict | str:
    """Worker entry point (module level so it pickles): a failure comes back as its message
    (pyobjc errors do not always pickle), never raised."""
    try:
        return analyze_asset(asset, cfg)
    except Exception as e:      # one bad file must not stop a 10k-file pass
        return f"{type(e).__name__}: {e}"
