"""Locating an object from a camera and a fiducial: the same code for rendered and real images.

The pick task (``homebot.envs.pick``) observes the cube's position with a 5 mm error, as a
camera might give. This module is how that position would be measured: an ArUco marker
(OpenCV, dictionary 4x4_50) on the object's top face, a calibrated pinhole camera whose pose
in the robot frame comes from the head's forward kinematics, and either

* ``locate_on_plane``: the ray through the marker centre meets the known plane of the
  object's top face (the object rests on the table), or
* ``locate_pnp``: the full marker pose from its four corners (``cv2.solvePnP``).

Camera conventions: MuJoCo cameras look along their -z with y up; OpenCV cameras look along
+z with y down. ``R_cam`` below is always the MuJoCo camera rotation (``data.cam_xmat``).
Needs ``opencv-contrib-python-headless`` (or any OpenCV >= 4.7 with the aruco module).
"""
from __future__ import annotations

import math

import numpy as np

DICT = "DICT_4X4_50"
MJ_TO_CV = np.diag([1.0, -1.0, -1.0])  # MuJoCo camera axes -> OpenCV camera axes


def _cv2():
    import cv2

    return cv2


def intrinsics(fovy_deg: float, width: int, height: int) -> np.ndarray:
    """Pinhole matrix of a MuJoCo camera (square pixels, principal point at the centre)."""
    f = 0.5 * height / math.tan(math.radians(fovy_deg) / 2)
    return np.array([[f, 0.0, width / 2], [0.0, f, height / 2], [0.0, 0.0, 1.0]])


def marker_image(marker_id: int = 0, px: int = 240, border_bits: int = 1) -> np.ndarray:
    """The printable marker (uint8, white quiet zone of one cell around the black border)."""
    cv2 = _cv2()
    d = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, DICT))
    cells = 4 + 2 + 2 * border_bits  # data + black border + white quiet zone
    inner = cv2.aruco.generateImageMarker(d, marker_id, px * (cells - 2 * border_bits) // cells)
    pad = (px - inner.shape[0]) // 2
    return np.pad(inner, pad, constant_values=255)


def detect(image: np.ndarray, marker_id: int = 0) -> np.ndarray | None:
    """Corner pixels (4 x 2, OpenCV order: top-left, top-right, bottom-right, bottom-left of the
    marker) of ``marker_id`` in an RGB or grey image, or None."""
    cv2 = _cv2()
    grey = image if image.ndim == 2 else cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    params = cv2.aruco.DetectorParameters()
    params.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    det = cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, DICT)), params)
    corners, ids, _ = det.detectMarkers(grey)
    if ids is None:
        return None
    for c, i in zip(corners, ids.ravel()):
        if int(i) == marker_id:
            return c.reshape(4, 2).astype(float)
    return None


def pixel_ray(uv, K: np.ndarray, R_cam: np.ndarray) -> np.ndarray:
    """Unit direction (world frame) of the ray through pixel ``uv``."""
    d_cv = np.linalg.solve(K, np.array([uv[0], uv[1], 1.0]))
    d = R_cam @ (MJ_TO_CV @ d_cv)
    return d / np.linalg.norm(d)


def marker_centre_pixel(corners: np.ndarray) -> np.ndarray:
    """Image of the marker centre: the intersection of the corner diagonals (exact under
    perspective, unlike the mean of the corners)."""
    p0, p1, p2, p3 = (np.append(c, 1.0) for c in corners)
    x = np.cross(np.cross(p0, p2), np.cross(p1, p3))
    return x[:2] / x[2]


def pixel_on_plane(uv, K: np.ndarray, cam_pos, R_cam: np.ndarray, plane_z: float) -> np.ndarray:
    """World point seen at pixel ``uv`` on the plane z = ``plane_z``."""
    d = pixel_ray(uv, K, R_cam)
    p = np.asarray(cam_pos, float)
    if abs(d[2]) < 1e-9:
        raise ValueError("ray parallel to the plane")
    return p + (plane_z - p[2]) / d[2] * d


def locate_on_plane(corners: np.ndarray, K: np.ndarray, cam_pos, R_cam: np.ndarray, plane_z: float) -> np.ndarray:
    """World position of the marker centre, given that it lies on the plane z = ``plane_z``."""
    return pixel_on_plane(marker_centre_pixel(corners), K, cam_pos, R_cam, plane_z)


def yaw_on_plane(corners: np.ndarray, K: np.ndarray, cam_pos, R_cam: np.ndarray, plane_z: float) -> float:
    """Direction (rad, about z) of the marker's first edge on the plane. A square marker on a
    cube face gives the cube's yaw modulo 90 deg, whichever way the label was printed."""
    p0, p1 = (pixel_on_plane(c, K, cam_pos, R_cam, plane_z) for c in corners[:2])
    return math.atan2(p1[1] - p0[1], p1[0] - p0[0])


def locate_pnp(corners: np.ndarray, K: np.ndarray, cam_pos, R_cam: np.ndarray, marker_len: float) -> np.ndarray:
    """World position of the marker centre from its full pose (no plane assumption)."""
    cv2 = _cv2()
    h = marker_len / 2
    obj = np.array([[-h, h, 0], [h, h, 0], [h, -h, 0], [-h, -h, 0]], float)
    ok, _, tvec = cv2.solvePnP(obj, corners.astype(np.float64), K, None, flags=cv2.SOLVEPNP_IPPE_SQUARE)
    if not ok:
        raise ValueError("solvePnP failed")
    return np.asarray(cam_pos, float) + R_cam @ (MJ_TO_CV @ tvec.ravel())
