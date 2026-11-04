"""5c: thrust-speed slope s in the 4-state longitudinal model; phugoid real part and damping across scale.

    python3 experiments/thrust_phugoid/run.py > experiments/thrust_phugoid/results.txt

s = dlnT/dlnV at fixed RPM (5b: median -2.25, 5th/95th -2.86/-1.54); s = 0 reproduces longitudinal_modes.
"""
import os, sys
import numpy as np
sys.path.insert(0, "src")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "longitudinal_modes"))
import run as lm

S_VALUES = (0.0, -1.54, -2.25, -2.86)
SCALES = (1.0, 0.5, 0.2, 0.1)


def trim_alpha(nc, xtr):
    al = np.linspace(0, 12, 121)
    re1 = lm.RHO * np.sqrt(2 * lm.M_FULL * lm.G / (lm.RHO * (lm.B_FULL ** 2 / lm.AR_W) * 0.8)) * (lm.B_FULL / lm.AR_W) / lm.MU
    cls = np.array([lm.section(lm.WING, re1, a, nc, xtr)[0] for a in al])
    return float(np.interp(0.8, cls, al))


def phugoid(ev):
    cp = [e for e in ev if e.imag > 1e-9]
    cp.sort(key=abs)
    return cp[0] if cp else None


def main():
    print("Phugoid vs thrust slope s; 'same CL' rule; real part and omega in omega*sqrt(span/g); zeta = -Re/|lambda|")
    for label, nc, xtr in (("free transition (n_crit 9)", 9, 1.0), ("tripped at 5% chord", 9, 0.05)):
        a_trim = trim_alpha(nc, xtr)
        print(f"\n{label}; trim alpha {a_trim:.2f} deg")
        print(f"  {'s':>6} {'n':>5} {'L/D':>5} {'Re(ph)':>8} {'|ph|':>7} {'zeta_ph':>8} {'Re(sp)':>8}")
        real = {}
        for s in S_VALUES:
            for n in SCALES:
                r = lm.modes(n, nc, xtr, a_trim, 0.8, s_thrust=s)
                ph = phugoid(r["eig"])
                cplx = sorted([e for e in r["eig"] if e.imag > 1e-9], key=abs)
                if ph is None or len(cplx) < 2:
                    print(f"  {s:6.2f} {n:5.2f} {r['ld']:5.1f}   (phugoid no longer an oscillatory pair)")
                    continue
                sp = cplx[-1]
                real[(s, n)] = ph.real
                print(f"  {s:6.2f} {n:5.2f} {r['ld']:5.1f} {ph.real:+8.4f} {abs(ph):7.4f} {-ph.real/abs(ph):8.4f} {sp.real:+8.3f}")
        for s in S_VALUES:
            if (s, 1.0) in real and (s, 0.2) in real:
                print(f"  s={s:5.2f}: Re(ph) change n=1 -> 0.2: {real[(s,0.2)]-real[(s,1.0)]:+.4f}")
        if (0.0, 1.0) in real and (-2.25, 1.0) in real:
            print(f"  shift at n=1 from s=0 to s=-2.25: {real[(-2.25,1.0)]-real[(0.0,1.0)]:+.4f}")


if __name__ == "__main__":
    main()
