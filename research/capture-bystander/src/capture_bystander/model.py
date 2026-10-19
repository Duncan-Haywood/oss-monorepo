"""Leak model for automatic bystander blurring (stdlib only).

A bystander is *identifiable* when the face is turned to the camera and spans at least R source pixels.
A blurring pipeline leaks when it fails to blur an identifiable bystander. Detector recall is an assumed
function of the target's size in pixels; nothing here is measured from footage.
"""
import math
import random

FACE_W = 0.15   # m, adult head breadth (assumed)
BODY_H = 1.7    # m, standing adult (assumed)
FACING = 0.5    # share of bystanders whose face is turned to the camera (assumed)

# source pixels per radian across the frame (width in px / horizontal field of view in rad); assumed frame sizes
CAMERAS = {
    "360 5.7K": 5760 / (2 * math.pi),
    "360 8K": 7680 / (2 * math.pi),
    "4K ultrawide 120deg": 3840 / math.radians(120),
    "4K 85mm-eq 24deg": 3840 / math.radians(24),
}


# horizontal field of view in degrees, matching CAMERAS
FOV = {"360 5.7K": 360.0, "360 8K": 360.0, "4K ultrawide 120deg": 120.0, "4K 85mm-eq 24deg": 24.0}


def identifiable_in_frame(name, density, ident_px=32.0, d_min=1.0):
    """Expected face-on, identifiable bystanders in one frame at `density` people per m^2."""
    r = identifiable_range(CAMERAS[name], ident_px)
    if r <= d_min:
        return 0.0
    return density * math.radians(FOV[name]) / 2 * (r * r - d_min * d_min) * FACING


def recall(px, mid, k=4.0):
    """Assumed detector recall for a target `px` pixels across: 0.5 at `mid`, a steep rise around it."""
    return 1.0 / (1.0 + (mid / px) ** k) if px > 0 else 0.0


def face_px(dist, ppr):
    return FACE_W / dist * ppr


def body_px(dist, ppr):
    return BODY_H / dist * ppr


def leak_at(dist, ppr, policy, face_mid=20.0, body_mid=40.0):
    """P(an identifiable bystander at `dist` m is left unblurred in a frame) under a blurring policy.

    face: blur where a face detector fires. body: blur the head region of any detected body.
    both: blur if either fires; the two detectors are assumed to err independently (optimistic).
    """
    mf = 1 - recall(face_px(dist, ppr), face_mid)
    mb = 1 - recall(body_px(dist, ppr), body_mid)
    return {"face": mf, "body": mb, "both": mf * mb}[policy]


def identifiable_range(ppr, ident_px):
    """Farthest distance at which a face-on face still spans `ident_px` pixels."""
    return FACE_W * ppr / ident_px


def crowd_leak(ppr, policy, ident_px=32.0, d_min=1.0, face_mid=20.0, body_mid=40.0, step=0.01):
    """Share of identifiable bystanders left unblurred, for people spread uniformly over the ground.

    Uniform density means the count at distance d grows as d, so weight each distance by d.
    """
    d_max = identifiable_range(ppr, ident_px)
    if d_max <= d_min:
        return 0.0
    num = den = 0.0
    n = int((d_max - d_min) / step)
    for i in range(n):
        d = d_min + (i + 0.5) * step
        num += d * leak_at(d, ppr, policy, face_mid, body_mid)
        den += d
    return num / den


def markov_misses(p_miss, run, frames, rng):
    """Frame-by-frame miss flags with marginal miss rate p_miss and mean miss-run length `run` frames."""
    if p_miss <= 0:
        return [False] * frames
    if p_miss >= 1:
        return [True] * frames
    leave_miss = 1.0 / run
    enter_miss = leave_miss * p_miss / (1 - p_miss)
    state = rng.random() < p_miss
    out = []
    for _ in range(frames):
        out.append(state)
        state = (rng.random() >= leave_miss) if state else (rng.random() < enter_miss)
    return out


def track_leaks(p_miss, run, frames, trials, seed=0):
    """Per-person outcomes over a shot of `frames` frames at a fixed distance.

    Returns (frame_share, any_frame, offline): the share of frames left unblurred by a per-frame blur,
    the share of people unblurred in at least one frame under it, and the share never detected at all,
    which is what an offline edit that blurs the whole track after one detection still leaks.
    """
    rng = random.Random(seed)
    fs = af = off = 0
    for _ in range(trials):
        m = markov_misses(p_miss, run, frames, rng)
        s = sum(m)
        fs += s / frames
        af += s > 0
        off += s == frames
    return fs / trials, af / trials, off / trials


# (name, largest dimension in m): assumed rig sizes, not measurements
PLATFORMS = [
    ("phone held up", 0.15),
    ("360 camera on 1.5 m pole", 1.5),
    ("4-camera tripod rig", 1.6),
    ("wheeled follow robot with mast", 1.8),
    ("small drone", 0.35),
]


def angular_size_deg(size_m, dist):
    return math.degrees(2 * math.atan(size_m / (2 * dist)))


def distance_at(size_m, deg):
    """Distance at which an object of `size_m` subtends `deg` degrees."""
    return size_m / (2 * math.tan(math.radians(deg) / 2))
