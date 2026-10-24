"""Where the money goes in an open, 3D-printed robot arm (SO-101 follower).

Downloads the follower's single-plate STL from TheRobotStudio/SO-ARM100 at a
pinned commit, computes the enclosed solid volume, and sets the plastic cost
against the purchased parts in that repository's own bill of materials.

    python3 so101_cost.py            # writes results.txt next to this file

Standard library only. The STL is about 25 MB and is cached in ./_cache
(gitignored by the pattern below; delete it to re-download).
"""
import os
import struct
import urllib.request

COMMIT = "a758567c3978dfeefe282ede0500085a48fe8f78"  # SO-ARM100 main, 2026-10-21
STL_URL = ("https://raw.githubusercontent.com/TheRobotStudio/SO-ARM100/"
           f"{COMMIT}/STL/SO101/Follower/Ender_Follower_SO101.stl")

# "Parts for One Follower Arm", SO-ARM100 README at COMMIT (US prices).
BOM = [  # (part, qty, unit USD, category)
    ("STS3215 servo 7.4V (C001)", 6, 13.89, "actuators"),
    ("Motor control board", 1, 10.60, "electronics"),
    ("USB-C cable, 2 pcs", 1, 7.00, "electronics"),
    ("Power supply", 1, 10.00, "electronics"),
    ("Table clamp, 2 pcs", 1, 5.00, "tooling"),
    ("Screwdriver set", 1, 6.00, "tooling"),
]
BOM_TOTAL_STATED = 121.94

PLA_DENSITY = 1.24  # g/cm^3, typical PLA datasheet value
PLA_USD_PER_KG = (15.0, 20.0, 30.0)  # low / mid / premium spool price, swept


def _load(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:5] == b"solid" and b"facet" in data[:1000]:
        tris, cur = [], []
        for line in data.decode("ascii", "replace").splitlines():
            parts = line.split()
            if parts and parts[0] == "vertex":
                cur.append(tuple(float(v) for v in parts[1:4]))
                if len(cur) == 3:
                    tris.append(cur)
                    cur = []
        return tris
    n = struct.unpack_from("<I", data, 80)[0]
    tris = []
    for i in range(n):
        v = struct.unpack_from("<12f", data, 84 + 50 * i)
        tris.append([v[3:6], v[6:9], v[9:12]])
    return tris


def signed_volume(tris):
    """Sum of signed tetrahedra to the origin (mm^3); exact for a closed mesh."""
    vol = 0.0
    for (ax, ay, az), (bx, by, bz), (cx, cy, cz) in tris:
        vol += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx)
                + az * (bx * cy - by * cx)) / 6.0
    return vol


def surface_area(tris):
    """Total triangle area (mm^2)."""
    area = 0.0
    for (ax, ay, az), (bx, by, bz), (cx, cy, cz) in tris:
        ux, uy, uz = bx - ax, by - ay, bz - az
        vx, vy, vz = cx - ax, cy - ay, cz - az
        nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
        area += 0.5 * (nx * nx + ny * ny + nz * nz) ** 0.5
    return area


# Printed-mass estimate at the README's 15% infill: a solid skin of thickness
# t over the whole surface plus 15% of the remaining interior. t is swept
# (two to four 0.4 mm perimeters, with top and bottom layers folded in).
INFILL = 0.15
SKIN_MM = (0.8, 1.2, 1.6)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    cache = os.path.join(here, "_cache")
    os.makedirs(cache, exist_ok=True)
    stl = os.path.join(cache, "Ender_Follower_SO101.stl")
    if not os.path.exists(stl):
        urllib.request.urlretrieve(STL_URL, stl)
    tris = _load(stl)
    vol_cm3 = abs(signed_volume(tris)) / 1000.0
    solid_g = vol_cm3 * PLA_DENSITY

    out = []
    p = out.append
    p(f"SO-101 follower, STL at SO-ARM100@{COMMIT[:12]}")
    p(f"triangles: {len(tris)}")
    p(f"enclosed solid volume: {vol_cm3:.1f} cm^3")
    p(f"solid PLA mass (upper bound, 100% infill): {solid_g:.0f} g")
    area_cm2 = surface_area(tris) / 100.0
    p(f"surface area: {area_cm2:.0f} cm^2")
    for t in SKIN_MM:
        skin = min(area_cm2 * t / 10.0, vol_cm3)
        g = (skin + INFILL * (vol_cm3 - skin)) * PLA_DENSITY
        p(f"  est. printed mass, {t} mm skin + {INFILL:.0%} infill: {g:.0f} g"
          f" (${g / 1000 * PLA_USD_PER_KG[1]:.2f} at ${PLA_USD_PER_KG[1]:.0f}/kg)")
    for price in PLA_USD_PER_KG:
        p(f"  plastic cost at ${price:.0f}/kg, solid: ${solid_g / 1000 * price:.2f}")
    p("")
    total = sum(q * u for _, q, u, _ in BOM)
    p(f"purchased parts total: ${total:.2f} (README states ${BOM_TOTAL_STATED})")
    cats = {}
    for _, q, u, c in BOM:
        cats[c] = cats.get(c, 0.0) + q * u
    worst_plastic = solid_g / 1000 * max(PLA_USD_PER_KG)
    grand = total + worst_plastic
    p(f"with solid plastic at the premium price: ${grand:.2f}")
    for c, v in sorted(cats.items(), key=lambda kv: -kv[1]):
        p(f"  {c:12s} ${v:7.2f}  {100 * v / grand:5.1f}%")
    p(f"  {'plastic':12s} ${worst_plastic:7.2f}  {100 * worst_plastic / grand:5.1f}%  (upper bound)")
    arm_only = total - cats["tooling"]
    p(f"excluding tooling: actuators are {100 * cats['actuators'] / (arm_only + worst_plastic):.1f}% "
      f"of ${arm_only + worst_plastic:.2f}")
    mid_skin = SKIN_MM[1]
    skin = min(area_cm2 * mid_skin / 10.0, vol_cm3)
    mid_plastic = (skin + INFILL * (vol_cm3 - skin)) * PLA_DENSITY / 1000 * PLA_USD_PER_KG[1]
    base = arm_only + mid_plastic
    p(f"central case (no tooling, {mid_skin} mm skin, ${PLA_USD_PER_KG[1]:.0f}/kg): ${base:.2f}")
    for c in ("actuators", "electronics"):
        p(f"  {c:12s} {100 * cats[c] / base:5.1f}%")
    p(f"  {'plastic':12s} {100 * mid_plastic / base:5.1f}%")
    text = "\n".join(out) + "\n"
    with open(os.path.join(here, "results.txt"), "w") as f:
        f.write(text)
    print(text, end="")


if __name__ == "__main__":
    main()
