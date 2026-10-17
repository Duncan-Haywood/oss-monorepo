"""Sweeps for garment-assistpower. Writes experiments/results.txt."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_assistpower.powertrain import PowerTrain, Body, suit_mass, net_change, best_gain

out = []
P = lambda *a: out.append(" ".join(str(x) for x in a))
pt = PowerTrain()
P("Active suit gain 0.3: mass and net whole-body change vs hours of battery (assumed power train)")
for h in (0, 1, 2, 4, 8):
    r = net_change(0.3, h, pt)
    P(f"{h} h: mass {r['mass_kg']:.2f} kg (motor {r['motor_kg']:.2f}, battery {r['batt_kg']:.2f}), electrical {r['elec_w']:.0f} W, net {r['dwhole_pct']:+.1f}%")
P("\nBest gain (grid 0.02..0.60) and its net change vs hours, by mass sensitivity")
for s in (0.005, 0.01, 0.02, 0.05):
    row = []
    for h in (1, 4, 8):
        v, g = best_gain(h, PowerTrain(mass_sens=s))
        row.append(f"{h}h: gain {g:.2f} -> {v:+.1f}%")
    P(f"sens {s:.3f}: " + "; ".join(row))
P("\nMotor+gearbox torque density (N m/kg) needed for net benefit: gain 0.3, 4 h battery; net change by density and mass sensitivity")
dens = (8, 20, 40, 80, 160)
P("sens   " + "  ".join(f"{d:>6}" for d in dens))
for s_ in (0.005, 0.01, 0.02):
    P(f"{s_:.3f}  " + "  ".join(f"{net_change(0.3, 4, PowerTrain(motor_nm_per_kg=d, mass_sens=s_))['dwhole_pct']:+6.1f}" for d in dens))
P("\nSame, battery share of suit mass at density 40 (gain 0.3), cell 150 Wh/kg, by hours")
for h in (1, 4, 8, 16):
    r = net_change(0.3, h, PowerTrain(motor_nm_per_kg=40))
    P(f"{h:>2} h: mass {r['mass_kg']:.2f} kg, battery {r['batt_kg']:.2f} kg, net {r['dwhole_pct']:+.1f}% (sens 1%/kg)")
txt = "\n".join(out)
print(txt)
open(os.path.join(os.path.dirname(__file__), "results.txt"), "w").write(txt + "\n")
