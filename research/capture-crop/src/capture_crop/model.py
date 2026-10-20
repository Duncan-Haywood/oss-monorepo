"""Crop and perspective limits of reframing 360-degree video into flat shots.

All geometry, no product data. An equirectangular frame W pixels wide spreads
360 degrees over W columns, so at the equator it holds W/360 pixels per degree.
Reframing cuts a rectilinear (pinhole) view out of it. At the view's centre a
rectilinear image with focal length f_px pixels maps one pixel to 1/f_px rad,
so the crop is native (no upscaling) at its centre when f_px = W / (2 pi).
That focal length, put on an output frame of w x h pixels, fixes the view's
diagonal field of view and hence its full-frame-equivalent focal length:

    f_eq = 21.63 mm * f_px / (sqrt(w^2 + h^2) / 2)

where 21.63 mm is half the 36 x 24 mm full-frame diagonal (the usual
"equivalent focal length" convention). It is an upper bound: lens sharpness,
stitching and compression make a real 360 camera resolve less than its
pixel count.
"""
import math

FF_HALF_DIAG_MM = math.hypot(36.0, 24.0) / 2  # 21.633 mm


def px_per_degree(width_px):
    """Pixels per degree of an equirectangular frame `width_px` wide, at the equator."""
    return width_px / 360.0


def focal_px(width_px):
    """Rectilinear focal length (px) whose centre pixel matches the source's angular pitch."""
    return width_px / (2 * math.pi)


def native_equiv_focal(width_px, out_w, out_h):
    """Longest full-frame-equivalent focal length (mm) cropped from a `width_px`
    equirect into an `out_w` x `out_h` frame without upscaling at the centre."""
    return FF_HALF_DIAG_MM * focal_px(width_px) / (math.hypot(out_w, out_h) / 2)


def equirect_width_for(f_eq_mm, out_w, out_h):
    """Equirect width (px) needed to crop a native `f_eq_mm`-equivalent view at out_w x out_h."""
    return 2 * math.pi * f_eq_mm * (math.hypot(out_w, out_h) / 2) / FF_HALF_DIAG_MM


def crop_upscale(width_px, f_eq_mm, out_w, out_h):
    """Linear upscale factor at the centre when an `f_eq_mm` view is cropped (1.0 = native)."""
    return max(1.0, f_eq_mm / native_equiv_focal(width_px, out_w, out_h))


# Perspective. Where the camera stands, not the lens, sets perspective: a crop
# from a camera at distance D looks like any lens used from D.

def distance_for_framing(f_eq_mm, subject_height_m, frame_height_mm=24.0):
    """Camera distance (m) at which an `f_eq_mm` full-frame lens fills the frame's
    short side (24 mm, landscape; pass 36 for a vertical frame) with a subject
    `subject_height_m` tall (thin-lens, distant-subject approximation)."""
    return f_eq_mm * subject_height_m / frame_height_mm


def feature_magnification(distance_m, depth_m):
    """How much larger a feature `depth_m` nearer the camera images than one at
    `distance_m` (e.g. nose tip against the ear plane): D / (D - depth)."""
    if distance_m <= depth_m:
        raise ValueError("camera inside the subject")
    return distance_m / (distance_m - depth_m)


def background_scale(distance_m, background_m):
    """Size of a background object `background_m` behind the subject, relative to
    the same object at the subject's plane, with the subject framed identically:
    D / (D + B). Larger means a bigger, flatter-looking ("compressed") background."""
    return distance_m / (distance_m + background_m)
