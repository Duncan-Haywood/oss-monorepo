"""The three builds of the platform: vacuum, mop, and vacuum-mop combo.

They share the chassis, drive, battery, sensors and electronics; only the
cleaning module changes. Widths and positions match `cad/ofr_cad/params.py`
(tests/test_variants.py checks they agree). Power draws and capacities
are design assumptions for planning, not measurements: replace them with
readings from your own build.
"""

from __future__ import annotations

from dataclasses import dataclass, field

# Shared platform (metres, watts).
CHASSIS_RADIUS = 0.165        # bumper outer radius
TRACK = 0.230                 # wheel centre-plane spacing
WHEEL_D = 0.072
CLIFF_SENSOR_LEAD = 0.052     # how far the outer front cliff sensors sit ahead of the wheel contact
CRUISE = 0.25                 # m/s while cleaning
TRANSIT = 0.35                # m/s on links and the trip home
TURN_RATE = 1.5               # rad/s on the spot


@dataclass(frozen=True)
class Tool:
    name: str                 # "vacuum" or "mop"
    width: float              # m cleaned across a lane
    edge_reach: float         # m from the robot centre the tool reaches during the edge pass


@dataclass(frozen=True)
class Variant:
    name: str
    title: str
    tools: tuple[Tool, ...]
    loads_w: dict = field(default_factory=dict)   # average electrical draw while cleaning
    bin_ml: float = 0.0
    tank_ml: float = 0.0
    note: str = ""

    @property
    def lane_width(self) -> float:
        """Lanes are spaced for the narrowest tool, so every tool covers the floor."""
        return min(t.width for t in self.tools)

    def clean_power_w(self) -> float:
        return sum(self.loads_w.values())

    def transit_power_w(self) -> float:
        return self.loads_w.get("electronics", 0) + self.loads_w.get("drive", 0)

    def radii(self, tool: Tool) -> dict[str, float]:
        """Paint radius per path phase for coverage: tools run on lanes and the edge pass, not on links."""
        return {"edge": tool.edge_reach, "lane": tool.width / 2}


# Vacuum: 160 mm roller in a 170 mm nozzle; the side brush (r 55 mm at
# 141 mm from the centre) reaches 196 mm from the centre, past the bumper.
VACUUM_TOOL = Tool("vacuum", 0.170, 0.196)
# Mop pads sit under the body: their outer edge is the edge reach, so a
# round mop-only robot leaves a strip along walls (the body is 165 mm).
MOP_TOOL = Tool("mop", 0.170, 0.085)
COMBO_MOP_TOOL = Tool("mop", 0.150, 0.075)

_SHARED = {"electronics": 4.0, "drive": 4.0}

VARIANTS: dict[str, Variant] = {
    "vacuum": Variant(
        "vacuum", "Robot vacuum", (VACUUM_TOOL,),
        {**_SHARED, "fan": 20.0, "main_brush": 4.0, "side_brush": 1.0},
        bin_ml=220.0, note="roller brush, side brush, 2,500 Pa-class fan, 0.22 L bin"),
    "mop": Variant(
        "mop", "Robot mop", (MOP_TOOL,),
        {**_SHARED, "pump": 0.5, "vibration": 0.8, "lift_servo": 0.2},
        tank_ml=380.0, note="170 mm vibrating microfibre pad, peristaltic pump, 0.38 L tank, pad lift"),
    "combo": Variant(
        "combo", "Robot vacuum-mop combo", (VACUUM_TOOL, COMBO_MOP_TOOL),
        {**_SHARED, "fan": 20.0, "main_brush": 4.0, "side_brush": 1.0, "pump": 0.5, "vibration": 0.8,
         "lift_servo": 0.2},
        bin_ml=130.0, tank_ml=135.0, note="vacuum ahead of a 150 mm pad: split 0.13 L bin and 0.135 L tank"),
}


def get(name: str) -> Variant:
    try:
        return VARIANTS[name]
    except KeyError:
        raise ValueError(f"unknown variant {name!r}; choose one of {', '.join(VARIANTS)}") from None
