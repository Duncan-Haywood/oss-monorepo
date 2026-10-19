"""Write experiments/results.txt: bystander-blur leak rates by camera, distance, policy and track persistence (deterministic)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from capture_bystander.model import (CAMERAS, PLATFORMS, angular_size_deg, crowd_leak, distance_at,  # noqa: E402
                                     face_px, identifiable_in_frame, identifiable_range, leak_at, track_leaks)

POL = ["face", "body", "both"]


def main():
    out = []
    ppr = CAMERAS["360 8K"]
    out.append("== A. per-frame leak by distance, 360 8K, identifiable = face-on and >= 32 px (face detector 50% at 20 px, body detector 50% at 40 px)")
    out.append("dist_m face_px face body both")
    for d in (2, 5, 10, 15, 20, 25, 30, 38):
        out.append(f"{d} {face_px(d, ppr):.1f} " + " ".join(f"{leak_at(d, ppr, p):.3f}" for p in POL))
    out.append("")
    out.append("== B. share of identifiable bystanders left unblurred per frame, people spread uniformly from 1 m out, by camera (identifiable range in m; counts at 0.05 people/m2)")
    out.append("camera range_m face body both identifiable_per_frame leaked_per_frame_face")
    for name, ppr in CAMERAS.items():
        n = identifiable_in_frame(name, 0.05)
        out.append(f"{name.replace(' ', '_')} {identifiable_range(ppr, 32):.1f} " + " ".join(f"{crowd_leak(ppr, p):.3f}" for p in POL)
                   + f" {n:.2f} {n * crowd_leak(ppr, 'face'):.3f}")
    out.append("")
    ppr = CAMERAS["360 8K"]
    out.append("== C. sensitivity, 360 8K, face-detector leak: identifiable size R (px) down, face-detector midpoint (px) across")
    out.append("R mid10 mid20 mid30")
    for r in (16, 24, 32, 48, 64):
        out.append(f"{r} " + " ".join(f"{crowd_leak(ppr, 'face', ident_px=r, face_mid=m):.3f}" for m in (10, 20, 30)))
    out.append("")
    out.append("== D. one person filmed 5 s (150 frames) at the edge of the identifiable range, 360 8K, face detector; 2000 trials per row")
    out.append("miss_run_frames frame_share any_frame_unblurred never_detected")
    pm = leak_at(identifiable_range(ppr, 32) * 0.99, ppr, "face")
    out.insert(len(out) - 1, f"(per-frame miss probability at 32 px: {pm:.3f})")
    for run in (1, 3, 10, 30, 150):
        fs, af, off = track_leaks(pm, run, 150, 2000, seed=run)
        out.append(f"{run} {fs:.3f} {af:.3f} {off:.3f}")
    out.append("")
    out.append("== E. apparent size of each platform (largest dimension, assumed)")
    out.append("platform size_m deg_at_3m deg_at_10m dist_for_1deg_m")
    for n, s in PLATFORMS:
        out.append(f"{n.replace(' ', '_')} {s} {angular_size_deg(s, 3):.1f} {angular_size_deg(s, 10):.1f} {distance_at(s, 1):.0f}")
    text = "\n".join(out) + "\n"
    (Path(__file__).resolve().parent / "results.txt").write_text(text)
    print(text)


if __name__ == "__main__":
    main()
