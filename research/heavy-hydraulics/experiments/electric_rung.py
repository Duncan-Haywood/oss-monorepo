"""Milestone 5c: the electric rung. What battery does the modelled duty cycle imply, against the vendor's runtime claim?

Mean pump-shaft power (kW) for open-centre and load-sensing at load factor 0.346 comes from payback.powers (milestone 4).
A battery-electric machine drives the same pump through motor + inverter + battery discharge, chain efficiency swept
0.80 to 0.92 (ASSUMED range; motor ~0.9-0.95, inverter ~0.97, battery ~0.95-0.98). Anchor (vendor, indicative): Volvo
ECR25 Electric, 20 kWh for up to 4 h and 40 kWh for up to 8 h, both a mean battery draw of 5 kW (volvoce.com product page).
Output: implied runtime on 20 kWh and the chain efficiency needed to reproduce 5 kW.
"""
import io, contextlib, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
with contextlib.redirect_stdout(io.StringIO()):
    import payback as pb

ANCHOR_KW = 5.0
print("p_n bar | OC kW | LS kW | chain eta | batt kW OC | LS | runtime h on 20 kWh OC | LS")
for pn in (8, 20, 40):
    oc, ls = pb.powers(pn, 300)
    for eta in (0.80, 0.86, 0.92):
        print(f"{pn:7d} | {oc:5.2f} | {ls:5.2f} | {eta:.2f} | {oc/eta:6.2f} | {ls/eta:5.2f} | {20*eta/oc:5.2f} | {20*eta/ls:5.2f}")
    print(f"        eta needed to match {ANCHOR_KW} kW: OC {oc/ANCHOR_KW:.2f}  LS {ls/ANCHOR_KW:.2f}")
