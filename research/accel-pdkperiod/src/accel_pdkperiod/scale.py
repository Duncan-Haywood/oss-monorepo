"""Re-reading an OpenRAM liberty access figure: energy if the value is pJ, or power x cycle if it is mW."""
import re


def source_checks(lib_py, delay_py, meas_py):
    """True/False for each fact about the OpenRAM characterizer that the reading rests on (text of the pinned sources)."""
    return dict(
        # the clk pin's rise_power / fall_power are the write1 / write0 (read1 / read0) measurements: data value, not clock edge
        rise_is_data1=bool(re.search(r'rise_power.*?write1_power|write1_power.*?rise_power', lib_py, re.S)),
        # the measurement is an average of -V*I(vdd) ...
        avg_power=bool(re.search(r"\.meas tran \{0\} avg \{1\} from=\{2\}n to=\{3\}n", meas_py)),
        # ... over exactly one clock cycle, cycle_times[k] to cycle_times[k+1]
        one_cycle=bool(re.search(r"t_initial = self\.cycle_times\[.*?\]\s*\n\s*t_final = self\.cycle_times\[.*?\+ 1\]", delay_py)),
        # reported in mW (W x 1e3)
        mw_scale=bool(re.search(r'power_measure\("write1_power", "RISE", measure_scale=1e3\)', delay_py)),
        # the library file declares leakage in mW as well
        leak_mw=bool(re.search(r'leakage_power_unit : \\"1mW\\"', lib_py)),
    )


def energy_pj(value, period_ns, per_edge=False):
    """Access energy in pJ if `value` is an average power in mW over one cycle of `period_ns` (1 mW x 1 ns = 1 pJ).
    per_edge: the cycle value is split over two clock edges, so one rising-edge access costs half."""
    return value * period_ns * (0.5 if per_edge else 1.0)


def flip_scale(thr_pj, e_weight_pj):
    """Factor s on the file's value at which register-file WS stops/starts beating OS: WS wins iff s*e_weight > thr."""
    return thr_pj / e_weight_pj


def ws_wins(thr_pj, e_weight_pj, s):
    return s * e_weight_pj > thr_pj
