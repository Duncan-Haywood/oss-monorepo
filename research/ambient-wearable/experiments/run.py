"""Print the battery-life table and sensitivities used in the README."""
from ambient_wearable.power import Params, avg_current_ma, battery_hours, with_

P = Params()
print("mode            speech  avg mA  hours   days")
for m, s in [("idle", 0), ("push_to_talk", .1), ("push_to_talk", .3), ("vad_gate", .1), ("vad_gate", .3),
             ("vad_gate", .6), ("always_stream", 1), ("raw_stream", 1)]:
    h = battery_hours(P, m, s)
    print(f"{m:<15} {s:>5.1f} {avg_current_ma(P, m, s):7.3f} {h:7.1f} {h/24:6.1f}")
print("\nvad_gate @ speech 0.3, one parameter at a time (hours):")
base = battery_hours(P, "vad_gate", .3)
for k, vals in [("i_mic_ma", [.3, .6, 1.0]), ("codec_load", [.1, .25, .5]), ("link_overhead", [1.5, 2, 4]),
                ("supply_eff", [.7, .85, .95]), ("usable_fraction", [.6, .8, 1.0])]:
    print(f"  {k:<16}", "  ".join(f"{v}->{battery_hours(with_(P, **{k: v}), 'vad_gate', .3):6.1f}" for v in vals))
print(f"base {base:.1f} h; mic-only ceiling {P.battery_mah*P.usable_fraction/(P.i_mic_ma/P.supply_eff):.1f} h")
