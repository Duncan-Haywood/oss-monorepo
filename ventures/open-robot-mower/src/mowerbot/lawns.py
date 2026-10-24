"""Example lawns, in metres. Made up for testing and the demo: not anyone's garden."""

from .planner import Lawn

BACKYARD = Lawn(
    name="backyard",
    outer=[(0, 0), (18, 0), (18, 7), (12, 7), (12, 13), (0, 13)],
    holes=[
        [(3, 8), (6, 8), (6.5, 10), (5, 11.5), (3, 11)],                  # flowerbed
        [(14.2, 2.6), (15.4, 2.9), (15.6, 4.1), (14.6, 4.6), (13.9, 3.7)],  # tree
    ],
    dock=(1.0, 0.6),
)

FRONT = Lawn(
    name="front",
    outer=[(0, 0), (10, 0), (10, 6), (0, 6)],
    holes=[],
    dock=(0.5, 0.5),
)

CURVED = Lawn(
    name="curved",
    outer=[(0, 0), (9, -1), (15, 1), (17, 6), (14, 11), (7, 12), (1, 9), (-1, 4)],
    holes=[[(7, 4), (9, 4), (9, 6), (7, 6)]],
    dock=(1.0, 1.0),
)

ALL = {lawn.name: lawn for lawn in (BACKYARD, FRONT, CURVED)}
