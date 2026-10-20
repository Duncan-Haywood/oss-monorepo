"""Write experiments/results.txt: crop and perspective limits of reframed 360 video.

    PYTHONPATH=src python experiments/run.py

Deterministic geometry. Equirect widths are nominal 2:1 frame widths for each
marketed class (5.7K = 5760, 8K = 7680 px); the 11.5K and 15K rows are
hypothetical cameras, not products. Distances and the 0.10 m feature depth are
stated assumptions, not measurements.
"""
from pathlib import Path
from capture_crop import (native_equiv_focal, equirect_width_for, crop_upscale,
                          distance_for_framing, feature_magnification, background_scale)

OUT = Path(__file__).resolve().parent / "results.txt"
WIDTHS = [("5.7K", 5760), ("8K", 7680), ("11.5K (hypothetical)", 11520), ("15K (hypothetical)", 15360)]
FRAMES = [("1080x1920 vertical", 1080, 1920), ("2160x3840 vertical", 2160, 3840), ("1920x1080 landscape", 1920, 1080)]
LENSES = [16, 24, 35, 50, 85, 135]
HEAD_SHOULDERS_M = 0.6   # subject height filling a vertical frame's long side (assumed)
FEATURE_DEPTH_M = 0.10   # nose tip in front of the ear plane (assumed)
BACKGROUND_M = 20.0      # a landmark 20 m behind the creator
STICK_M = 0.8            # 360 camera on a selfie stick (assumed)


def main():
    L = []
    L.append("A. Longest native full-frame-equivalent focal length (mm) cropped from a 360 equirect")
    L.append(f"{'equirect class':24s}" + "".join(f"{n:>22s}" for n, _, _ in FRAMES))
    for name, w in WIDTHS:
        L.append(f"{name:24s}" + "".join(f"{native_equiv_focal(w, a, b):22.1f}" for _, a, b in FRAMES))
    L.append("")
    L.append("B. Equirect width (px) needed to crop each lens natively, and the 8K camera's upscale factor")
    L.append(f"{'lens (mm eq)':14s}{'1080x1920 width':>18s}{'2160x3840 width':>18s}{'8K upscale @1080x1920':>24s}")
    for f in LENSES:
        L.append(f"{f:<14d}{equirect_width_for(f, 1080, 1920):18.0f}{equirect_width_for(f, 2160, 3840):18.0f}"
                 f"{crop_upscale(7680, f, 1080, 1920):24.2f}")
    L.append("")
    L.append(f"C. Perspective: head-and-shoulders ({HEAD_SHOULDERS_M} m) filling a vertical frame; "
             f"feature depth {FEATURE_DEPTH_M} m; background {BACKGROUND_M:.0f} m behind")
    L.append(f"{'setup':34s}{'distance m':>12s}{'nose enlarged %':>17s}{'background x vs stick':>23s}")
    rows = [("360 cam on stick, any crop", STICK_M)]
    rows += [(f"{f} mm eq from framing distance", distance_for_framing(f, HEAD_SHOULDERS_M, 36.0)) for f in (24, 35, 50, 85, 135)]
    ref = background_scale(STICK_M, BACKGROUND_M)
    for name, d in rows:
        L.append(f"{name:34s}{d:12.2f}{(feature_magnification(d, FEATURE_DEPTH_M) - 1) * 100:17.1f}"
                 f"{background_scale(d, BACKGROUND_M) / ref:23.2f}")
    L.append("")
    n8 = native_equiv_focal(7680, 1080, 1920)
    L.append("Summary")
    L.append(f"8K 360 to 1080x1920 vertical: native up to {n8:.1f} mm eq; 85 mm needs "
             f"{equirect_width_for(85, 1080, 1920):.0f} px ({equirect_width_for(85, 1080, 1920) / 7680:.1f}x the 8K width)")
    L.append(f"stick at {STICK_M} m enlarges a 10 cm-deep feature {(feature_magnification(STICK_M, FEATURE_DEPTH_M) - 1) * 100:.1f}%; "
             f"an 85 mm framing distance of {distance_for_framing(85, HEAD_SHOULDERS_M, 36.0):.2f} m, "
             f"{(feature_magnification(distance_for_framing(85, HEAD_SHOULDERS_M, 36.0), FEATURE_DEPTH_M) - 1) * 100:.1f}%")
    OUT.write_text("\n".join(L) + "\n")
    print("\n".join(L))


if __name__ == "__main__":
    main()
