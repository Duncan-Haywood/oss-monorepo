"""2-D geometric model of N cameras around a subject at the origin.

Cameras look at the origin. A feature on the subject is triangulated from every
camera that sees it; each camera gives a bearing with angular noise
sigma_a = sigma_px / f_px, i.e. a lateral position error sigma_a * z
perpendicular to its ray. Information from rays adds (weighted least squares),
so the position covariance is the inverse of the summed information matrices.
"""
import math

SIGMA_PX = 0.5          # assumed matching noise, pixels
LONG_SIDE_PX = 3840     # assumed sensor long side used for the vertical (portrait) axis
SUBJECT_M = 1.8         # subject height


def ring(n, radius, span_deg=360.0, start_deg=0.0):
    """n cameras at equal azimuth steps over span_deg (a full ring steps span/n)."""
    step = span_deg / n if span_deg >= 360 else (span_deg / (n - 1) if n > 1 else 0.0)
    return [(radius * math.cos(math.radians(start_deg + i * step)),
             radius * math.sin(math.radians(start_deg + i * step))) for i in range(n)]


def f_px(vfov_deg):
    return (LONG_SIDE_PX / 2) / math.tan(math.radians(vfov_deg) / 2)


def covariance(cams, vfov_deg, point=(0.0, 0.0)):
    """2x2 covariance of the triangulated point; None if under 2 cameras or degenerate."""
    sa = SIGMA_PX / f_px(vfov_deg)
    a = b = d = 0.0
    for (cx, cy) in cams:
        dx, dy = point[0] - cx, point[1] - cy
        z = math.hypot(dx, dy)
        nx, ny = -dy / z, dx / z                      # perpendicular to the ray
        w = 1.0 / (sa * z) ** 2
        a += w * nx * nx
        b += w * nx * ny
        d += w * ny * ny
    det = a * d - b * b
    if len(cams) < 2 or det <= 1e-9 * (a + d) ** 2:
        return None
    return (d / det, -b / det, a / det)


def rms_error(cams, vfov_deg):
    """sqrt(trace covariance) in metres at the origin (None if degenerate)."""
    c = covariance(cams, vfov_deg)
    return None if c is None else math.sqrt(c[0] + c[2])


def max_gap_deg(cams):
    """Largest azimuth gap between neighbouring cameras seen from the subject."""
    az = sorted(math.degrees(math.atan2(y, x)) % 360 for x, y in cams)
    if len(az) < 2:
        return 360.0
    gaps = [az[i + 1] - az[i] for i in range(len(az) - 1)] + [360 - az[-1] + az[0]]
    return max(gaps)


def mean_view_miss_deg(cams, samples=3600):
    """Mean angle from a random wanted viewing direction to the nearest camera."""
    az = [math.degrees(math.atan2(y, x)) % 360 for x, y in cams]
    tot = 0.0
    for i in range(samples):
        t = 360.0 * (i + 0.5) / samples
        tot += min(min(abs(t - a), 360 - abs(t - a)) for a in az)
    return tot / samples


def pixels_on_subject(radius, vfov_deg):
    """Pixels covering the subject's height at the given distance (centred, in frame)."""
    return SUBJECT_M * f_px(vfov_deg) / radius


def fits(radius, vfov_deg):
    """Whole subject inside the vertical field of view."""
    return 2 * radius * math.tan(math.radians(vfov_deg) / 2) >= SUBJECT_M
