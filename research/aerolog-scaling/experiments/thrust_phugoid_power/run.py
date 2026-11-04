"""5d: constant-power thrust law (s = -1) in the 4-state model: phugoid real part across scale.

    python3 experiments/thrust_phugoid_power/run.py > experiments/thrust_phugoid_power/results.txt

T = P eta / V with eta held constant gives dlnT/dlnV = -1 exactly. 5c used the fixed-RPM
slope (-2.25); a motor-governed (throttle-fixed) aircraft sits nearer -1. Reuses 5c's machinery.
"""
import os, sys
sys.path.insert(0, "src")
import importlib.util
HERE = os.path.dirname(os.path.abspath(__file__))


def load(name, rel):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel, "run.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


lm = load("lm_modes", "longitudinal_modes")
sys.modules["run"] = lm  # 5c's script does `import run as lm`; give it the modes module, not this file
tp = load("tp_5c", "thrust_phugoid")

S_VALUES = (0.0, -1.0, -2.25)
SCALES = (1.0, 0.5, 0.2)


def main():
    print("Phugoid real part vs thrust law: s=0 constant thrust, s=-1 constant power, s=-2.25 fixed RPM (5b median)")
    for label, nc, xtr in (("free transition (n_crit 9)", 9, 1.0), ("tripped at 5% chord", 9, 0.05)):
        a_trim = tp.trim_alpha(nc, xtr)
        print(f"\n{label}; trim alpha {a_trim:.2f} deg")
        print(f"  {'s':>6} {'n':>5} {'L/D':>5} {'Re(ph)':>8} {'zeta_ph':>8}")
        real = {}
        for s in S_VALUES:
            for n in SCALES:
                r = lm.modes(n, nc, xtr, a_trim, 0.8, s_thrust=s)
                ph = tp.phugoid(r["eig"])
                real[(s, n)] = ph.real
                print(f"  {s:6.2f} {n:5.2f} {r['ld']:5.1f} {ph.real:+8.4f} {-ph.real/abs(ph):8.4f}")
        for n in SCALES:
            lin = real[(0.0, n)] + (real[(-2.25, n)] - real[(0.0, n)]) * (-1.0 / -2.25)
            print(f"  n={n:4.2f}: linear interpolation of s=-1 from s=0 and s=-2.25: {lin:+.4f}; computed {real[(-1.0, n)]:+.4f}; gap {real[(-1.0, n)]-lin:+.5f}")


if __name__ == "__main__":
    main()
