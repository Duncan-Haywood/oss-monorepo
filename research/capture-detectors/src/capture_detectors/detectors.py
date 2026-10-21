"""Thin wrappers over three stock detectors, all via OpenCV: YuNet (CNN face), Haar (Viola-Jones face), YOLOX-s (person)."""
import cv2
import numpy as np

from . import fetch


class YuNet:
    def __init__(self, score=0.6):
        self.d = cv2.FaceDetectorYN.create(fetch.ensure("yunet.onnx"), "", (320, 320), score, 0.3, 5000)

    def __call__(self, img):
        h, w = img.shape[:2]
        self.d.setInputSize((w, h))
        _, faces = self.d.detect(img)
        return [] if faces is None else [tuple(float(v) for v in f[:4]) + (float(f[-1]),) for f in faces]


class Haar:
    def __init__(self):
        self.c = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    def __call__(self, img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        r = self.c.detectMultiScale(g, scaleFactor=1.05, minNeighbors=3, minSize=(8, 8))
        return [tuple(float(v) for v in f) + (1.0,) for f in r]


class YoloxPerson:
    """YOLOX-s on COCO, class 0 only. Decoding follows opencv_zoo's yolox.py (Apache-2.0)."""

    def __init__(self, conf=0.3, nms=0.5):
        self.net = cv2.dnn.readNet(fetch.ensure("yolox.onnx"))
        self.conf, self.nms = conf, nms
        grids, strides = [], []
        for s in (8, 16, 32):
            n = 640 // s
            xv, yv = np.meshgrid(np.arange(n), np.arange(n))
            grids.append(np.stack((xv, yv), 2).reshape(1, -1, 2))
            strides.append(np.full((1, n * n, 1), s))
        self.grids, self.strides = np.concatenate(grids, 1), np.concatenate(strides, 1)

    def __call__(self, img):
        h, w = img.shape[:2]
        ratio = min(640 / h, 640 / w)
        pad = np.full((640, 640, 3), 114.0, np.float32)
        pad[: int(h * ratio), : int(w * ratio)] = cv2.resize(img, (int(w * ratio), int(h * ratio)))
        self.net.setInput(np.transpose(pad, (2, 0, 1))[None])
        d = self.net.forward(self.net.getUnconnectedOutLayersNames())[0][0].copy()
        d[:, :2] = (d[:, :2] + self.grids[0]) * self.strides[0]
        d[:, 2:4] = np.exp(d[:, 2:4]) * self.strides[0]
        score = d[:, 4] * d[:, 5]  # objectness x class 0 (person)
        keep = score > self.conf
        boxes = np.stack([d[:, 0] - d[:, 2] / 2, d[:, 1] - d[:, 3] / 2, d[:, 2], d[:, 3]], 1)[keep]
        sc = score[keep]
        if not len(sc):
            return []
        idx = cv2.dnn.NMSBoxes(boxes.tolist(), sc.tolist(), self.conf, self.nms)
        return [tuple(float(v) / ratio for v in boxes[i]) + (float(sc[i]),) for i in np.array(idx).reshape(-1)]


class Hog:
    """OpenCV's stock Dalal-Triggs people detector (64x128 window)."""

    def __init__(self):
        self.h = cv2.HOGDescriptor()
        self.h.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())

    def __call__(self, img):
        if img.shape[0] < 128 or img.shape[1] < 64:  # smaller than the window: it cannot fire (and OpenCV crashes)
            return []
        r, w = self.h.detectMultiScale(img, winStride=(8, 8), padding=(8, 8), scale=1.05)
        return [tuple(float(v) for v in b) + (float(s),) for b, s in zip(r, np.array(w).reshape(-1))]
