import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from elicitation import run_drift_study

for tau in (0.95, 0.99):
    print(f"tau={tau}, Student-t df=3, 500 calibration samples, mean of 20 seeds")
    print(f"{'strategy':10} {'pinball loss':>13} {'coverage':>9} {'fault detect':>13}")
    for k, v in run_drift_study(tau=tau).items():
        print(f"{k:10} {v['loss']:13.4f} {v['coverage']:9.4f} {v['detect']:13.4f}")
    print()
