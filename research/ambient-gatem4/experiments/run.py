"""Flash size, libcalls and executed Thumb-2 instructions per 20 ms frame for ambient-gatefw's gate,
built with clang for Cortex-M4 and run in Unicorn. Prints the tables quoted in the README."""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ambient-gatefw" / "src"))
from ambient_gatefw.ref import FRAME, adaptive_gate, block_floor, frame_ms, synth  # noqa: E402
from ambient_gatem4.m4 import Emu, Image  # noqa: E402

BLOCKS = [1, 2, 5, 10, 25, 50, 125]      # 125 keeps one finished block: the floor scan is ~1 comparison
ROOMS = [-60, -50, -40, -30]
SECONDS = 60
K, HANG = 4, 10

print(f"synthetic audio from ambient-gateroc: {SECONDS} s per room, rooms {ROOMS} dBFS, seed 3; k = {K}, hangover {HANG}")
print("clang 18 --target=thumbv7em-none-eabi -mcpu=cortex-m4 -mfloat-abi=soft -ffreestanding; Unicorn Thumb-2 (M-class)")
print("instructions are executed instructions inside adaptive_gate_push, steady state (after the window fills), mean over rooms")
print("the libgcc 64-bit divide is replaced by a host computation and NOT counted\n")

streams = {r: synth(SECONDS, r, seed=3)[0] for r in ROOMS}
rows = {}
for opt in ("Os", "O2"):
    print(f"== -{opt} ==")
    print("block  .text bytes  libcalls                 instr/frame  floor-scan share   agrees with Python (open, floor)")
    base = None
    for b in BLOCKS:
        img = Image(b, opt)
        per, ok = [], True
        for r, x in streams.items():
            ms = frame_ms(x)
            e = Emu(img, K, HANG)
            out = np.array([e.push(x[i * FRAME:(i + 1) * FRAME]) for i in range(len(x) // FRAME)], dtype=np.int64)
            ok &= bool((out[:, 0] == adaptive_gate(ms, K, HANG)).all() or b != 1)
            ok &= bool((out[:, 1] == block_floor(ms, b)).all())
            assert (out[:, 3] == 1).all()
            per.append(out[260:, 2].mean())
        rows[(opt, b)] = (img.text_bytes, float(np.mean(per)), ok, img.libcalls)
    base = rows[(opt, 125)][1]
    for b in BLOCKS:
        t, m, ok, lc = rows[(opt, b)]
        share = (m - base) / m
        print(f"{b:>5}  {t:>10}  {','.join(lc):<24} {m:>10.0f}   {share:>14.1%}   {'yes' if ok else 'NO'}")
    print()
