# Draft upstream report for PyBaMM (not filed)

Filing this on the PyBaMM issue tracker publishes under the owner's account, so it is left for the owner.
Found by `cell-fidelity` milestone 5p ([`../../LOG.md`](../../LOG.md)); measured on PyBaMM 26.10.1.1.

**Title:** Side-reaction lithium-loss variables omit "Number of electrodes connected in parallel to make a cell"

**Summary.** `"Total lithium lost [mol]"` and `"Total lithium lost to side reactions [mol]"` are documented in
`base_lithium_ion_model.py` as two ways of measuring the same loss ("should give same value"). With degradation
switched on they differ by exactly the parallel-electrode count. `"Total lithium [mol]"` (from the particle and
electrolyte totals) includes the count; `"Loss of lithium to {domain} lithium plating [mol]"`
(`base_plating.py`, `Q = c * L_k * L_y * L_z`) and the SEI counterparts multiply by the electrode height and
width only. `"Loss of capacity to ... [A.h]"` and `"Total capacity lost to side reactions [A.h]"` inherit the same factor.

**Reproduce.**

```python
import pybamm
pybamm.set_logging_level("ERROR")
opts = {"SEI": "solvent-diffusion limited", "lithium plating": "irreversible"}
for n in (1.0, 5.0):
    pv = pybamm.ParameterValues("OKane2022")
    pv["Number of electrodes connected in parallel to make a cell"] = n
    I = 1.5 * n
    exp = pybamm.Experiment([(f"Discharge at {I} A until 2.5 V", f"Charge at {I} A until 4.2 V")] * 2)
    sol = pybamm.Simulation(pybamm.lithium_ion.DFN(opts), parameter_values=pv, experiment=exp).solve(initial_soc=1.0)
    lost = sol["Total lithium lost [mol]"].entries[-1]
    side = sol["Total lithium lost to side reactions [mol]"].entries[-1]
    print(n, lost / side)   # 1.0 -> 1.0000, 5.0 -> 5.0000
```

The same holds on default `Ai2020` (34 parallel electrodes): the ratio is 34.0000 on every run we made (93 degraded
runs over 8 conditions, ratio divided by the count 1.00000 on all).

**Expected.** Both totals agree; the per-mechanism loss variables are cell totals like `"Total lithium [mol]"`.

**Suggested fix.** Multiply `Q_plated_Li`, `Q_dead_Li` and the SEI loss totals by the parallel-electrode count
(as the particle lithium totals do), or document them as per-electrode-pair quantities.
