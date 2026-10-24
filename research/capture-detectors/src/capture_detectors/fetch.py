"""Download the pinned data and models into a cache outside the tree.

Nothing fetched here is committed: the photos are Flickr images from COCO under their
own Creative Commons licences, and the models keep their own licences (README).
"""
import hashlib
import os
import subprocess
import urllib.request
import zipfile

ZOO = "https://media.githubusercontent.com/media/opencv/opencv_zoo/48b10fa505aeb51fbd127fc60a5c660040e823b7/models"
FILES = {
    "coco128.zip": (
        "https://github.com/ultralytics/yolov5/releases/download/v1.0/coco128.zip",
        "61e5e3028863d8ffc3b81d6a514603954889f0edd5e4b44c4ce60b2da99aeb8e",
    ),
    "yunet.onnx": (
        ZOO + "/face_detection_yunet/face_detection_yunet_2023mar.onnx",
        "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4",
    ),
    "yolox.onnx": (
        ZOO + "/object_detection_yolox/object_detection_yolox_2022nov.onnx",
        "c5c2d13e59ae883e6af3b45daea64af4833a4951c92d116ec270d9ddbe998063",
    ),
}


def cache_dir():
    d = os.environ.get("CAPTURE_DETECTORS_CACHE", os.path.expanduser("~/.cache/capture-detectors"))
    os.makedirs(d, exist_ok=True)
    return d


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _download(url, dest):
    try:
        urllib.request.urlretrieve(url, dest)
    except Exception:
        subprocess.run(["curl", "-sSfL", "-m", "300", "-o", dest, url], check=True)


def ensure(name):
    """Path of a pinned file, downloaded and checksummed on first use."""
    url, want = FILES[name]
    path = os.path.join(cache_dir(), name)
    if not os.path.exists(path) or sha256(path) != want:
        _download(url, path)
        got = sha256(path)
        if got != want:
            raise RuntimeError(f"{name}: sha256 {got} != pinned {want}")
    return path


def coco128_dir():
    root = os.path.join(cache_dir(), "coco128-unzipped")
    if not os.path.isdir(os.path.join(root, "coco128")):
        with zipfile.ZipFile(ensure("coco128.zip")) as z:
            z.extractall(root)
    return os.path.join(root, "coco128")
