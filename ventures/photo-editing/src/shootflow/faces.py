"""Opt-in face and closed-eye scoring through an external on-device detector.

ShootFlow stays stdlib-only, so it ships no face model. A photographer who wants
closed-eye culling points ``SHOOTFLOW_FACE_DETECTOR`` at a command; ShootFlow runs
it (no shell) with the image path appended and reads one JSON object from stdout::

    {"faces": [{"size": 0.12, "eyes_open": 0.9}, {"size": 0.04, "eyes_open": null}]}

``size`` is the face's share of the frame area (0 to 1); ``eyes_open`` is 0 to 1,
or null when the detector could not tell. Anything else (no variable, a missing
command, a timeout, bad JSON) returns None and the analysis keeps its measured
score. The adjustment is a stated blend, not a trained one: it has been checked
on made-up detector output only, not on human picks of real portraits.
"""

from __future__ import annotations

import json
import math
import os
import shlex
import subprocess
from dataclasses import dataclass
from pathlib import Path

DETECTOR_ENV = "SHOOTFLOW_FACE_DETECTOR"
_TIMEOUT_SECONDS = 60.0
# Faces under 1% of the frame are background people; a blink there is not the shot's fault.
_MIN_FACE_SIZE = 0.01
_CLOSED_EYES_STORY_PENALTY = 0.25
_FACE_PRESENT_STORY_BONUS = 0.03
_MAX_FACES = 64


@dataclass(frozen=True)
class FaceReport:
    face_count: int
    prominent_faces: int
    worst_eyes_open: float | None

    @property
    def story_adjustment(self) -> float:
        """Added to the story score: a bonus for a face in frame, a penalty for a blink."""

        if self.prominent_faces == 0:
            return 0.0
        adjustment = _FACE_PRESENT_STORY_BONUS
        if self.worst_eyes_open is not None:
            adjustment -= _CLOSED_EYES_STORY_PENALTY * (1.0 - self.worst_eyes_open)
        return adjustment


def parse_faces(payload: object) -> FaceReport | None:
    """Read detector output; None if it does not match the contract."""

    if not isinstance(payload, dict) or not isinstance(payload.get("faces"), list):
        return None
    faces = payload["faces"]
    if len(faces) > _MAX_FACES:
        return None
    prominent = 0
    worst: float | None = None
    for face in faces:
        if not isinstance(face, dict):
            return None
        size = _unit(face.get("size"))
        if size is None:
            return None
        eyes = face.get("eyes_open")
        if eyes is not None:
            eyes = _unit(eyes)
            if eyes is None:
                return None
        if size < _MIN_FACE_SIZE:
            continue
        prominent += 1
        if eyes is not None:
            worst = eyes if worst is None else min(worst, eyes)
    return FaceReport(face_count=len(faces), prominent_faces=prominent, worst_eyes_open=worst)


def detect_faces(image: Path, *, environ: dict[str, str] | None = None) -> FaceReport | None:
    command = (environ if environ is not None else os.environ).get(DETECTOR_ENV, "").strip()
    if not command:
        return None
    try:
        argv = shlex.split(command) + [str(image)]
        result = subprocess.run(
            argv, capture_output=True, text=True, timeout=_TIMEOUT_SECONDS, check=False, shell=False
        )
    except (OSError, ValueError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    try:
        return parse_faces(json.loads(result.stdout))
    except json.JSONDecodeError:
        return None


def _unit(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    if not math.isfinite(number) or number < 0.0 or number > 1.0:
        return None
    return number
