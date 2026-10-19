"""Battery model for a gated audio pendant: the `vad_gate` mode of `ambient-wearable`'s power.py,
copied (same Params, same assumptions) so this project is self-contained. Nothing is measured on
hardware. The only change: the gate-open fraction is passed in as `open_fraction`."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Params:
    i_sleep_ma: float = 0.0015
    cpu_ma_per_mhz: float = 0.052
    cpu_mhz: float = 64.0
    i_tx_ma: float = 4.8
    i_rx_ma: float = 4.6
    i_mic_ma: float = 0.6
    battery_mah: float = 150.0
    supply_eff: float = 0.85
    usable_fraction: float = 0.8
    coded_kbps: float = 32.0
    phy_kbps: float = 1000.0
    link_overhead: float = 2.0
    rx_share: float = 0.3
    codec_load: float = 0.25
    vad_load: float = 0.01


def gated_current_ma(p: Params, open_fraction: float) -> float:
    full = p.cpu_ma_per_mhz * p.cpu_mhz
    duty = min(1.0, p.coded_kbps / p.phy_kbps * p.link_overhead)
    radio = duty * (p.rx_share * p.i_rx_ma + (1 - p.rx_share) * p.i_tx_ma)
    closed = p.i_sleep_ma + p.i_mic_ma + p.vad_load * full
    opened = p.i_sleep_ma + p.i_mic_ma + (p.vad_load + p.codec_load) * full + radio
    return ((1 - open_fraction) * closed + open_fraction * opened) / p.supply_eff


def battery_hours(p: Params, open_fraction: float) -> float:
    return p.battery_mah * p.usable_fraction / gated_current_ma(p, open_fraction)
