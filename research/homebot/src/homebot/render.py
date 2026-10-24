"""Offscreen rendering helpers (set ``MUJOCO_GL=osmesa`` or ``egl`` on a headless machine)."""
from __future__ import annotations

import numpy as np


def snapshot(model, data, width=640, height=480, azimuth=140.0, elevation=-20.0, distance=None,
             lookat=None, camera: str | None = None, groups=(0, 1, 2), hide_sites=True):
    """RGB image of the current state from a free camera or a named camera."""
    import mujoco

    with mujoco.Renderer(model, height, width) as r:
        opt = mujoco.MjvOption()
        for g in range(6):
            opt.geomgroup[g] = 1 if g in groups else 0
        if hide_sites:
            for g in range(6):
                opt.sitegroup[g] = 0
        if camera is not None:
            r.update_scene(data, camera=camera, scene_option=opt)
        else:
            cam = mujoco.MjvCamera()
            mujoco.mjv_defaultFreeCamera(model, cam)
            cam.azimuth = azimuth
            cam.elevation = elevation
            if distance is not None:
                cam.distance = distance
            if lookat is not None:
                cam.lookat[:] = lookat
            r.update_scene(data, camera=cam, scene_option=opt)
        return r.render().copy()


def save_png(img: np.ndarray, path) -> None:
    from PIL import Image

    Image.fromarray(img).save(path)


def montage(images, cols=2) -> np.ndarray:
    rows = (len(images) + cols - 1) // cols
    h, w, _ = images[0].shape
    out = np.full((rows * h, cols * w, 3), 255, np.uint8)
    for i, im in enumerate(images):
        r, c = divmod(i, cols)
        out[r * h:(r + 1) * h, c * w:(c + 1) * w] = im
    return out
