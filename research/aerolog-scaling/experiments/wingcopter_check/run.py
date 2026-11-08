"""Milestone 10e: does 10a's energy model reproduce a flown small cargo VTOL, the Wingcopter 198?
Published (manufacturer and trade press, see LOG.md 10e): MTOW 25 kg; 20 kg operating weight including two
814 Wh Li-ion packs (1628 Wh); payload 4.7 kg (manufacturer page) or 6 kg (others); range 94 km (manufacturer,
payload unstated) or 75 km at 6 kg; cruise 90 km/h.  Pack mass is NOT published: swept 150 to 220 Wh/kg.
Predictions fixed before the run (see LOG.md): P1 model range 120-180 km (> 94); P2 implied L/D*eta_c 5-8;
P3 implied non-energy fraction 0.36-0.51 and below the 0.48 NASA floor for packs >= 170 Wh/kg."""
import math
G, RHO, T_H, RES = 9.80665, 1.225, 120.0, 1.2
W, EBAT, U = 25.0, 1628.0, 0.9
FM, ETA_H, DL = 0.7, 0.85, 150.0

def hover_wh(W=W, DL=DL):
    return W * G * math.sqrt(DL / (2 * RHO)) / (FM * ETA_H) * T_H / 3600

def range_km(ld_eta, W=W):
    avail = EBAT * U / RES - hover_wh(W)
    return avail * 3600 * ld_eta / (W * G) / 1000

def implied_ld_eta(R_km, W=W):
    avail = EBAT * U / RES - hover_wh(W)
    return R_km * 1000 * W * G / (avail * 3600)

print(f"hover 2 min at DL {DL:.0f} N/m2 (10a values): {hover_wh():.0f} Wh of {EBAT:.0f}")
print(f"A. 10a model (L/D 12 x eta_c 0.85 = {12*0.85:.1f}): range {range_km(12*0.85):.0f} km (published 94; 75 at 6 kg)")
print("B. implied L/D x eta_c (and L/D at eta_c 0.85) from published range, 20% reserve, 90% usable")
for R, lab in ((94, "94 km"), (75, "75 km @ 6 kg")):
    x = implied_ld_eta(R)
    print(f"   {lab}: {x:.1f}  (L/D {x/0.85:.1f})")
for DLx in (50, 100, 200):
    print(f"   sensitivity DL {DLx}: 94 km -> {94e3*W*G/((EBAT*U/RES-hover_wh(DL=DLx))*3600):.1f}")
print("C. non-energy fraction (operating weight less pack)/MTOW vs assumed installed pack Wh/kg")
for e in (150, 170, 190, 220):
    mb = EBAT / e
    print(f"   {e} Wh/kg: pack {mb:.1f} kg, f_non {(20-mb)/W:.3f}, payload frac {4.7/W:.3f} / {6/W:.3f}")
