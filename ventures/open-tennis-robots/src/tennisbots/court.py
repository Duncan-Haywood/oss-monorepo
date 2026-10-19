"""Tennis court geometry (ITF dimensions) and the coordinate frame every module uses.

Frame: origin on the ground at the centre of the net.
  x  along the court, negative on the robot's side, positive on the player's side
  y  across the court, positive to the robot's left when it faces the player
  z  up
Units are metres, seconds, radians unless a name says otherwise.
"""

from __future__ import annotations

from dataclasses import dataclass

LENGTH = 23.77            # baseline to baseline
HALF_LENGTH = LENGTH / 2  # net to baseline
SINGLES_WIDTH = 8.23
DOUBLES_WIDTH = 10.97
SERVICE_LINE = 6.40       # distance from the net
NET_HEIGHT_CENTRE = 0.914
NET_HEIGHT_POST = 1.07
# Doubles posts stand 0.914 m outside the doubles sideline.
NET_POST_Y = DOUBLES_WIDTH / 2 + 0.914


def net_height(y: float) -> float:
    """Approximate top-of-net height at lateral position y.

    The real cord sags as a catenary; a straight line from centre strap to
    post is within a couple of centimetres and is what this uses.
    """
    frac = min(1.0, abs(y) / NET_POST_Y)
    return NET_HEIGHT_CENTRE + (NET_HEIGHT_POST - NET_HEIGHT_CENTRE) * frac


@dataclass(frozen=True)
class Rect:
    """Axis-aligned rectangle on the ground plane."""

    x0: float
    y0: float
    x1: float
    y1: float

    def __post_init__(self) -> None:
        if self.x1 < self.x0 or self.y1 < self.y0:
            raise ValueError("Rect needs x0 <= x1 and y0 <= y1")

    def contains(self, x: float, y: float, margin: float = 0.0) -> bool:
        return (self.x0 - margin <= x <= self.x1 + margin
                and self.y0 - margin <= y <= self.y1 + margin)

    def inflate(self, d: float) -> "Rect":
        return Rect(self.x0 - d, self.y0 - d, self.x1 + d, self.y1 + d)

    def corners(self) -> list[tuple[float, float]]:
        return [(self.x0, self.y0), (self.x1, self.y0), (self.x1, self.y1), (self.x0, self.y1)]


def singles_half(side: int) -> Rect:
    """Singles court on one side of the net: side=-1 robot's half, +1 player's half."""
    w = SINGLES_WIDTH / 2
    if side < 0:
        return Rect(-HALF_LENGTH, -w, 0.0, w)
    return Rect(0.0, -w, HALF_LENGTH, w)


def is_in_singles(x: float, y: float) -> bool:
    return abs(x) <= HALF_LENGTH and abs(y) <= SINGLES_WIDTH / 2
