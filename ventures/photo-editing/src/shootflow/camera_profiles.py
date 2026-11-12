"""Pick a camera's ``.dcp`` profile from a folder, by the camera that took the file.

A Canon CR2 carries no colour matrix, so developing one needs a camera
profile (``raw_develop``, ``cr2``). One ``--dcp`` file is enough for a single
body; a shoot from two bodies, or the overnight pipeline, needs a folder of
profiles and a rule for which one each file gets. The rule, in order:

1. a file named exactly for the camera, ``<camera>.dcp`` (case and repeated
   spaces ignored): the photographer's explicit choice;
2. otherwise the profiles whose own UniqueCameraModel tag names the camera
   (every Adobe, dcamprof and RawTherapee profile states one): if one, that;
3. if several (Adobe's DNG Converter installs Adobe Standard, Camera
   Faithful, Camera Landscape and more per body), the one whose ProfileName
   or file name says "Adobe Standard", which is what Lightroom and Camera Raw
   apply by default;
4. otherwise the file is refused, naming the candidates, rather than one
   being picked silently: a different profile is a different colour.

The camera name is the CR2's Make and Model as a DNG's UniqueCameraModel
would spell it (``cr2.unique_camera_model``). Regional names differ on some
bodies (a "Canon EOS 600D" is a "Rebel T3i" in the US); a profile named for
the other name is found by rule 1 when its file is renamed to the camera's.

In the pipeline the folder is ``color/camera-profiles/`` in the shoot
workspace, beside the shoot LUT (``color/shoot_look.cube``). Symlinks there are
ignored, as everywhere else in a workspace.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from shootflow import cr2
from shootflow import raw_develop as rd

CAMERA_PROFILES_DIR = "color/camera-profiles"
_DEFAULT_HINT = "adobe standard"


@dataclass(frozen=True)
class ProfileChoice:
    path: Path
    profile: rd.Ifd
    camera: str
    rule: str  # "file name", "profile tag" or "Adobe Standard"


def _norm(name: str) -> str:
    return " ".join(name.casefold().split())


def camera_of(source: Path | str) -> str:
    """The camera name of a RAW file that needs a profile (a CR2)."""

    data = Path(source).read_bytes()
    if not cr2.is_cr2(data):
        raise rd.DevelopError(f"{Path(source).name}: camera profiles are chosen for Canon CR2 files only")
    camera = cr2.camera_model(data)
    if not camera:
        raise rd.DevelopError(f"{Path(source).name}: the CR2 names no camera (no Make or Model tag)")
    return camera


def _profiles(directory: Path) -> list[tuple[Path, rd.Ifd]]:
    if not directory.is_dir() or directory.is_symlink():
        return []
    found = []
    for path in sorted(directory.iterdir()):
        if path.suffix.lower() != ".dcp" or path.is_symlink() or not path.is_file():
            continue
        try:
            found.append((path, rd.read_dcp(path)))
        except (rd.DevelopError, OSError):
            continue  # not a profile; the refusal below lists what was looked at
    return found


def choose_profile(directory: Path | str, camera: str) -> ProfileChoice:
    """The profile in ``directory`` for ``camera``; ``DevelopError`` naming the gap when none fits."""

    directory = Path(directory)
    profiles = _profiles(directory)
    want = _norm(camera)
    for path, ifd in profiles:
        if _norm(path.stem) == want:
            return ProfileChoice(path, ifd, camera, "file name")
    tagged = [(p, i) for p, i in profiles if _norm(rd._text(i.get(rd.TAG_UNIQUE_CAMERA_MODEL))) == want]
    if len(tagged) == 1:
        return ProfileChoice(tagged[0][0], tagged[0][1], camera, "profile tag")
    if len(tagged) > 1:
        standard = [
            (p, i)
            for p, i in tagged
            if _DEFAULT_HINT in _norm(rd._text(i.get(rd.TAG_PROFILE_NAME))) or _DEFAULT_HINT in _norm(p.stem)
        ]
        if len(standard) == 1:
            return ProfileChoice(standard[0][0], standard[0][1], camera, "Adobe Standard")
        names = ", ".join(p.name for p, _ in tagged)
        raise rd.DevelopError(
            f"{len(tagged)} profiles in {directory} are for {camera!r} ({names}); keep one, or copy the one "
            f"you want to '{camera}.dcp'"
        )
    have = sorted({rd._text(i.get(rd.TAG_UNIQUE_CAMERA_MODEL)) or p.name for p, i in profiles})
    listed = f" (it has profiles for: {', '.join(have)})" if have else ""
    raise rd.DevelopError(
        f"no camera profile for {camera!r} in {directory}{listed}: copy the camera's .dcp there (Adobe's free "
        f"DNG Converter installs one per camera, e.g. '{camera} Adobe Standard.dcp' under CameraRaw/CameraProfiles), "
        "or convert the file to DNG"
    )


def profile_for(source: Path | str, directory: Path | str) -> ProfileChoice:
    return choose_profile(directory, camera_of(source))


__all__ = ["CAMERA_PROFILES_DIR", "ProfileChoice", "camera_of", "choose_profile", "profile_for"]
