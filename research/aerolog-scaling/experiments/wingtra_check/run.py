"""Milestone 10j: does 10a's energy model reproduce a second flown small VTOL, the WingtraOne Gen II?
Published (search-result summaries of Wingtra and reseller spec sheets; wingtra.com and the PDFs were not
fetchable from the session, so NOT read from the datasheet): MTOW 4.8 kg (one reseller: 3.7 kg); two 99 Wh
packs (198 Wh); flight time up to 59 min (54 min with a heavier camera); cruise 16 m/s (one retailer);
wingspan 1.25 m (one sheet; a reseller says 1.6 m).  Mass during the 59 min flight is not published, so
W is swept 3.7 to 4.8 kg.
Predictions fixed before the run (hand estimate: 198*0.9/1.2/(59/60) minus 21 Wh hover, W 4.8):
P1 10a's L/D 12 x eta_c 0.85 model gives an endurance over 90 min (> 59 published);
P2 the L/D*eta_c implied by 59 min at 16 m/s is 3 to 5.5, below 10a's 10.2 and below the Wingcopter's 5.7;
P3 the implied value moves under 30% across W 3.7 to 4.8 kg."""
import math
G, RHO, T_H, RES, U = 9.80665, 1.225, 120.0, 1.2, 0.9
E, V, T_PUB = 198.0, 16.0, 59.0
FM, ETA_H, DL = 0.7, 0.85, 150.0

def hover_wh(W):
    return W * G * math.sqrt(DL / (2 * RHO)) / (FM * ETA_H) * T_H / 3600

def avail(W):
    return E * U / RES - hover_wh(W)

def endurance_min(ld_eta, W):  # cruise only, level, constant speed
    return avail(W) * 3600 * ld_eta / (W * G * V) / 60

def implied(T_min, W):
    return W * G * V * T_min * 60 / (avail(W) * 3600)

print("W kg | hover Wh | 10a endurance (L/D*eta 10.2) | implied L/D*eta_c for 59 min | for 54 min")
for W in (3.7, 4.0, 4.4, 4.8):
    print(f"{W:4.1f} | {hover_wh(W):6.1f} | {endurance_min(10.2, W):6.0f} min | {implied(59, W):5.2f} | {implied(54, W):5.2f}")
print("range-equivalent 59 min x 16 m/s =", round(59*60*V/1000, 1), "km (cruise only, no transitions counted)")
