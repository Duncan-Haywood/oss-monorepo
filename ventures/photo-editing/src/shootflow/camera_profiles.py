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

from shootflow import arw, cr2, cr3, crw, hasselblad, iiq, kodak, mrw, nef, orf, pef, raf, rw2, srw
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
    """The camera name of a RAW file that needs a profile (a CRW, a CR2, a CR3, an ARW, a NEF, an ORF, an RW2, an SRW, a PEF or an MRW)."""

    data = Path(source).read_bytes()
    if iiq.is_iiq(data):
        kind, camera = "IIQ", iiq.camera_model(data)
    elif crw.is_crw(data):
        kind, camera = "CRW", crw.camera_model(data)
    elif cr3.is_cr3(data):
        kind, camera = "CR3", cr3.camera_model(data, readable=True)
    elif raf.is_raf(data):
        kind, camera = "RAF", raf.camera_model(data)
    elif cr2.is_cr2(data):
        kind, camera = "CR2", cr2.camera_model(data)
    elif arw.is_arw(data):
        kind, camera = "ARW", arw.camera_model(data)
    elif nef.is_nef(data):
        kind, camera = "NEF", nef.camera_model(data)
    elif orf.is_orf(data):
        kind, camera = "ORF", orf.camera_model(data)
    elif rw2.is_rw2(data):
        kind, camera = "RW2", rw2.camera_model(data)
    elif pef.is_pef(data):  # before SRW: a Samsung K-mount body's PEF says SAMSUNG too
        kind, camera = "PEF", pef.camera_model(data)
    elif srw.is_srw(data):
        kind, camera = "SRW", srw.camera_model(data)
    elif mrw.is_mrw(data):
        kind, camera = "MRW", mrw.camera_model(data)
    elif kodak.is_dcr(data):
        kind, camera = "DCR", kodak.camera_model(data)
    elif hasselblad.is_3fr(data):  # develops with its own matrix; a profile is optional
        kind, camera = "3FR", hasselblad.camera_model(data)
    else:
        raise rd.DevelopError(
            f"{Path(source).name}: camera profiles are chosen for Canon CRW, CR2 and CR3, Sony ARW, Nikon NEF, Olympus ORF, Panasonic RW2, Samsung SRW, Pentax PEF, Fujifilm RAF, Minolta MRW, Kodak DCR, Phase One IIQ and Hasselblad 3FR files only"
        )
    if not camera:
        raise rd.DevelopError(f"{Path(source).name}: the {kind} names no camera (no Make or Model tag)")
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
