"""Lateral (wind and seismic) check of the house-framing house with segmented wood shear walls.

Stylised and unverified against a code: every coefficient is an input, from memory (see README).
Units: lb, ft, psf, plf unless a name ends in _in.
"""
from dataclasses import dataclass

from house_framing.model import ADVANCED_2X6, CONVENTIONAL_2X4, CONVENTIONAL_2X6, House, walls_of

# Nominal unit shear (plf) of 15/32 structural-I sheathing, 8d common nails, by panel-edge spacing in
# inches: (seismic, wind). From memory of SDPWS Table 4.3A; NOT checked against the standard.
NAILING = {6: (730, 1020), 4: (1020, 1430), 3: (1330, 1860), 2: (1740, 2435)}
ASD_DIVISOR = 2.0  # nominal to allowable (ASD) unit shear
ASPECT_MAX = 3.5  # tallest allowed height to width ratio of a segment
ROOF_RISE_FT = 14.0 * 4 / 12  # 4:12 roof over a 28 ft span


@dataclass(frozen=True)
class Site:
    kz: float = 0.70  # velocity pressure exposure coefficient at mean roof height (assumed)
    kd: float = 0.85  # directionality
    cp_net: float = 1.3  # windward plus leeward, simplified (assumed)
    gust: float = 0.85
    r_factor: float = 6.5  # light-frame wood shear walls
    roof_dead_psf: float = 15.0
    wall_dead_psf: float = 10.0


def wind_pressure(v_mph, site=Site()):
    """Strength-level design pressure on the projected area, psf: 0.00256 Kz Kd V^2 x Cp x G."""
    return 0.00256 * site.kz * site.kd * v_mph ** 2 * site.cp_net * site.gust


def _areas(house):
    half = house.plate_height_in / 12 / 2
    long_face = house.length_ft * (half + ROOF_RISE_FT)  # wind across the ridge, onto a long wall
    gable_face = house.width_ft * half + 0.5 * house.width_ft * ROOF_RISE_FT
    return {"across ridge": long_face, "along ridge": gable_face}


def demands(house=House(), v_mph=115.0, sds=0.5, site=Site()):
    """ASD base shear (lb) per direction. Wind across the ridge is resisted by the two gable walls
    (they are parallel to it) and wind along the ridge by the two long walls; the same for seismic.
    Returns {direction: (wind_per_line, seismic_per_line)}; two lines resist each direction."""
    p = 0.6 * wind_pressure(v_mph, site)  # ASD = 0.6 W
    weight = (site.roof_dead_psf * house.width_ft * house.length_ft
              + site.wall_dead_psf * 2 * (house.width_ft + house.length_ft) * house.plate_height_in / 12 / 2)
    seismic = 0.7 * sds / site.r_factor * weight  # ASD = 0.7 E
    return {d: (p * a / 2, seismic / 2) for d, a in _areas(house).items()} | {"weight": weight}


def segments(wall, height_in):
    """Full-height solid piers (widths in inches) of a wall at least height/3.5 wide."""
    edges, pos = [], 0.0
    for op in sorted(wall.openings, key=lambda o: o.pos_in):
        edges.append((pos, op.pos_in))
        pos = op.pos_in + op.width_in
    edges.append((pos, wall.length_in))
    return [b - a for a, b in edges if b - a >= height_in / ASPECT_MAX]


def _ca(width_in, height_in):
    r = height_in / width_in
    return 1.0 if r <= 2 else 1.25 - 0.125 * r  # aspect-ratio reduction above 2:1


def line_capacity(wall, edge_in, kind, height_in=96.0):
    """Allowable lateral capacity (lb) of one wall line; kind is 'wind' or 'seismic'."""
    v = NAILING[edge_in][1 if kind == "wind" else 0] / ASD_DIVISOR
    return sum(v * w / 12 * _ca(w, height_in) for w in segments(wall, height_in))


def design(house=House(), scheme=CONVENTIONAL_2X6, v_mph=115.0, sds=0.5, site=Site()):
    """Per direction and load kind: the loosest nailing that carries the demand, or None; plus the
    hold-down tension at the demand unit shear over the solid length times an 8 ft wall (no dead-load
    relief; hold-downs are normally sized at the nailing's full capacity, which is higher)."""
    dem = demands(house, v_mph, sds, site)
    long_w, _, gable_w, _ = walls_of(house, scheme)
    # wind across the ridge is carried by gable walls, along the ridge by long walls
    walls = {"across ridge": gable_w, "along ridge": long_w}
    out = {}
    for d, wall in walls.items():
        for k, i in (("wind", 0), ("seismic", 1)):
            need = dem[d][i]
            pick = next((e for e in (6, 4, 3, 2) if line_capacity(wall, e, k) >= need), None)
            segs = segments(wall, 96.0)
            solid = sum(segs) / 12
            v = need / solid if pick and solid else None  # demand unit shear over the solid length
            out[(d, k)] = {"need_lb": need, "edge_in": pick, "solid_ft": solid,
                           "wall_ft": wall.length_in / 12,
                           "uplift_lb": v * 96.0 / 12 if pick else None,
                           "cap6_lb": line_capacity(wall, 6, k)}
    return out


def required_solid_ft(need_lb, edge_in, kind, height_in=96.0):
    """Length of full-height wall (ft, ignoring the aspect-ratio reduction) that carries need_lb."""
    return need_lb / (NAILING[edge_in][1 if kind == "wind" else 0] / ASD_DIVISOR)


def _bisect(fn, lo, hi):
    for _ in range(60):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if fn(mid) else (lo, mid)
    return lo


def max_wind_speed(house=House(), scheme=CONVENTIONAL_2X6, edge_in=2, site=Site()):
    """Highest ultimate wind speed (mph) at which both directions pass at the given nailing."""
    ok = lambda v: all(r["edge_in"] is not None and r["edge_in"] >= edge_in
                       for (d, k), r in design(house, scheme, v, 0.0, site).items() if k == "wind")
    return _bisect(ok, 50.0, 1000.0)


def max_sds(house=House(), scheme=CONVENTIONAL_2X6, edge_in=2, site=Site()):
    """Highest SDS at which both directions pass at the given nailing."""
    ok = lambda s: all(r["edge_in"] is not None and r["edge_in"] >= edge_in
                       for (d, k), r in design(house, scheme, 0.0, s, site).items() if k == "seismic")
    return _bisect(ok, 0.0, 30.0)
