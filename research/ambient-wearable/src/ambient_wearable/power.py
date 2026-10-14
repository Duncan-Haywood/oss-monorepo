"""Average-current model for an always-on audio pendant.

Every field of Params is either a figure read from a vendor page on 2026-10-13 (source in the
comment) or an assumption of mine (marked ASSUMPTION). Nothing is measured on hardware.
"""
from dataclasses import dataclass, replace


@dataclass(frozen=True)
class Params:
    # nRF52840 product specification, key-features page (read via a page summariser 2026-10-13)
    i_sleep_ma: float = 0.0015      # System ON, RTC wake, no RAM retention, at 3 V
    cpu_ma_per_mhz: float = 0.052   # running CoreMark from flash
    cpu_mhz: float = 64.0
    i_tx_ma: float = 0.0 + 4.8      # radio TX peak at 0 dBm
    i_rx_ma: float = 4.6            # radio RX peak
    # Retailer listing of a PDM MEMS microphone breakout, typical active supply current
    i_mic_ma: float = 0.6
    battery_mah: float = 150.0      # 3.7 V LiPo cell listing, nominal
    # ASSUMPTIONS
    supply_eff: float = 0.85        # battery-to-rail conversion efficiency (not 1.0)
    usable_fraction: float = 0.8    # fraction of nominal capacity actually delivered
    raw_kbps: float = 256.0         # 16 kHz x 16 bit
    coded_kbps: float = 32.0        # LC3-class codec rate
    phy_kbps: float = 1000.0        # BLE 1M PHY
    link_overhead: float = 2.0      # radio-on time per payload bit vs ideal (headers, IFS, empty events)
    rx_share: float = 0.3           # fraction of radio-on time spent in RX (acks, polls)
    codec_load: float = 0.25        # fraction of CPU busy encoding while streaming coded audio
    vad_load: float = 0.01          # fraction of CPU busy running the energy gate


def radio_duty(p: Params, kbps: float) -> float:
    return min(1.0, kbps / p.phy_kbps * p.link_overhead)


def avg_current_ma(p: Params, mode: str, speech_fraction: float = 0.3) -> float:
    """Average battery-side current for a mode.

    always_stream : mic on, codec runs, coded audio streamed all the time
    raw_stream    : mic on, no codec, raw PCM streamed (shows why a codec is needed)
    vad_gate      : mic on, energy gate always runs, codec + radio only while speech
    push_to_talk  : mic off except while speech (a lower bound the user pays for with a button)
    idle          : sleep only
    """
    cpu_full = p.cpu_ma_per_mhz * p.cpu_mhz

    def rail(mic_on, cpu_load, kbps):
        d = radio_duty(p, kbps)
        radio = d * (p.rx_share * p.i_rx_ma + (1 - p.rx_share) * p.i_tx_ma)
        return p.i_sleep_ma + (p.i_mic_ma if mic_on else 0.0) + cpu_load * cpu_full + radio

    s = speech_fraction
    if mode == "idle":
        r = p.i_sleep_ma
    elif mode == "always_stream":
        r = rail(True, p.codec_load, p.coded_kbps)
    elif mode == "raw_stream":
        r = rail(True, 0.02, p.raw_kbps)
    elif mode == "vad_gate":
        r = (1 - s) * rail(True, p.vad_load, 0.0) + s * rail(True, p.vad_load + p.codec_load, p.coded_kbps)
    elif mode == "push_to_talk":
        r = (1 - s) * rail(False, 0.0, 0.0) + s * rail(True, p.codec_load, p.coded_kbps)
    else:
        raise ValueError(mode)
    return r / p.supply_eff


def battery_hours(p: Params, mode: str, speech_fraction: float = 0.3) -> float:
    return p.battery_mah * p.usable_fraction / avg_current_ma(p, mode, speech_fraction)


def with_(p: Params, **kw) -> Params:
    return replace(p, **kw)
