"""Milestone 2j: with the load-sensing margin read from Rexroth's A10VO documentation, does 2i's idle ranking hold?

dp_ls (LS differential = standby pressure margin) was 25 bar (Briganti 2022 thesis, a midi-excavator model). Rexroth
Canada's A10VO Technical Information Manual, Module 3A (rev. 2.0, 2006), s. 7.2, gives the factory standby setting as
"usually 200 PSI" = 13.8 bar; reseller listings for A10VO DFR/DFR1 units give an LS differential of 14 bar (not a
manufacturer document). Cells: dp_ls 25 (as before), 14, and 10 (a low-side sweep). Open-centre p_n from 2i's valve
(Salami VD8A, 4 sections, text reading) with `extra` bar 0 or 5 (extra ASSUMED). LS standby flow stays 2 L/min (ASSUMED).
Reuses 2g's `ratio` (now taking dp_ls); work-phase margins in `ratio` use the same dp_ls.
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from idle_models import ratio
from neutral_sourced import p_n_text

if __name__ == "__main__":
    print("load factor 0.346; 4 sections (text reading); LS standby 2 L/min; 3,000 cycles per cell")
    print("dp_ls | extra | p_n | LS/OC median (5-95%) | share LS>OC")
    for dp in (25.0, 14.0, 10.0):
        for extra in (0.0, 5.0):
            p = p_n_text(4) + extra
            m, lo, hi, w = ratio(0.346, p, 2.0, n_per_seed=600, dp_ls=dp)
            print(f"{dp:>4g} | +{extra:g} | {p:5.2f} | {m:.3f} ({lo:.3f} to {hi:.3f}) | {w:5.1f}%")
