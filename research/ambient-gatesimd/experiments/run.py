"""Instructions per 20 ms frame, code size, libcalls and decision agreement for three builds of the
adaptive gate on Cortex-M4 (clang, Unicorn). Prints the tables quoted in the README."""
import subprocess
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ambient_gatesimd.build import Emu, Image  # noqa: E402
from ambient_gatefw.ref import FRAME, adaptive_gate, block_floor, frame_ms, synth  # noqa: E402

ROOMS = [-60, -50, -40, -30]
SEEDS = [3, 4, 5]
SECONDS = 60
K, HANG = 4, 10
NAMES = {0: "0 original (64-bit mean, divide)", 1: "1 SMLALD energy, divide kept", 2: "2 SMLALD, no divide (sum domain)"}

print(f"synthetic audio from ambient-gateroc: {SECONDS} s per room x seeds {SEEDS}, rooms {ROOMS} dBFS; k = {K}, hangover {HANG}")
print("clang 18 --target=thumbv7em-none-eabi -mcpu=cortex-m4 -mfloat-abi=soft -ffreestanding; Unicorn Thumb-2")
print("instr/frame: executed instructions in bench_push, steady state (frames 260+), mean over rooms and seeds;")
print("the libgcc 64-bit divide of variants 0 and 1 is replaced by a host computation and NOT counted\n")

streams = {(r, s): synth(SECONDS, r, seed=s)[0] for r in ROOMS for s in SEEDS}
for opt in ("Os", "O2"):
    for block in (1, 10):
        print(f"== -{opt}, block {block} ==")
        print(f"{'variant':<36}{'.text B':>8}  {'libcalls':<18}{'instr/frame':>11}  {'open frames differing from variant 0':>38}")
        ref_open = {}
        for v in (0, 1, 2):
            img = Image(v, block, opt)
            per, diff, total = [], 0, 0
            for key, x in streams.items():
                e = Emu(img, K, HANG)
                out = np.array([e.push(x[i * FRAME:(i + 1) * FRAME]) for i in range(len(x) // FRAME)], dtype=np.int64)
                per.append(out[260:, 2].mean())
                if v == 0:
                    ref_open[key] = out[:, 0]
                else:
                    diff += int((out[:, 0] != ref_open[key]).sum())
                    total += len(out)
            d = "-" if v == 0 else f"{diff} of {total}"
            print(f"{NAMES[v]:<36}{img.text_bytes:>8}  {','.join(img.libcalls) or 'none':<18}{np.mean(per):>11.0f}  {d:>38}")
        print()

print("== gate state, bytes of RAM (size of the static gate struct in the linked image, llvm-nm -S) ==")
for block in (1, 10):
    sizes = []
    for v in (0, 1, 2):
        nm = subprocess.run(["llvm-nm", "-S", str(Image(v, block).dir / "gate.elf")], check=True, capture_output=True, text=True).stdout
        sizes.append(next(int(l.split()[1], 16) for l in nm.split("\n") if l.endswith(" b g") or l.endswith(" g")))
    print(f"block {block:>2}: variant 0 {sizes[0]} B, variant 1 {sizes[1]} B, variant 2 {sizes[2]} B")
