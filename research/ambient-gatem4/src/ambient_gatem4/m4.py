"""Build ambient-gatefw's adaptive gate for Cortex-M4 (thumbv7em, soft float, freestanding) with clang
and run it frame by frame in a Unicorn Thumb-2 emulator, counting executed instructions.

Instruction counts are not cycles: Unicorn has no pipeline, wait-state or flash-accelerator model."""
import shutil
import struct
import subprocess
import tempfile
from pathlib import Path

import numpy as np
try:
    from unicorn import UC_ARCH_ARM, UC_HOOK_CODE, UC_MODE_THUMB, UC_MODE_MCLASS, Uc
    from unicorn.arm_const import (UC_ARM_REG_LR, UC_ARM_REG_PC, UC_ARM_REG_R0, UC_ARM_REG_R1,
                                   UC_ARM_REG_R2, UC_ARM_REG_R3, UC_ARM_REG_SP)
except ImportError:   # tests skip when the emulator is missing
    Uc = None

HERE = Path(__file__).resolve().parents[2]
SRC = HERE.parent / "ambient-gatefw" / "firmware"
BENCH = HERE / "firmware" / "bench.c"
UDIVMOD = 0x7F800
BASE, END_ADDR, STACK_TOP, REGION = 0x10000, 0x7FF00, 0x7F000, 0x80000
TARGET = ["--target=thumbv7em-none-eabi", "-mcpu=cortex-m4", "-mfloat-abi=soft", "-ffreestanding"]


def have_tools():
    return Uc is not None and all(shutil.which(t) for t in ("clang", "ld.lld", "llvm-nm", "llvm-objcopy", "llvm-size"))


class Image:
    """A linked gate image: .text/.rodata bytes, symbol addresses, undefined-library-call list."""

    def __init__(self, block, opt="Os"):
        self.block, self.opt = block, opt
        d = Path(tempfile.mkdtemp(prefix="gatem4-"))
        objs = []
        for src in (SRC / "adaptive_gate.c", BENCH):
            o = d / (src.stem + ".o")
            subprocess.run(["clang", *TARGET, f"-{opt}", f"-DAGATE_BLOCK={block}", f"-I{SRC}", "-c",
                            str(src), "-o", str(o)], check=True)
            objs.append(o)
        self.gate_obj = objs[0]
        sz = subprocess.run(["llvm-size", str(objs[0])], check=True, capture_output=True, text=True).stdout.split("\n")[1].split()
        self.text_bytes = int(sz[0])
        und = subprocess.run(["llvm-nm", "-u", str(objs[0])], check=True, capture_output=True, text=True).stdout.split()
        self.libcalls = sorted(set(und) - {"U"})
        elf = d / "gate.elf"
        # __aeabi_uldivmod is a libgcc routine; give it an address the emulator hooks (Emu._hook)
        link = subprocess.run(["ld.lld", f"-Ttext={BASE:#x}", "-e", "0", f"--defsym=__aeabi_uldivmod={UDIVMOD:#x}",
                               *[str(o) for o in objs], "-o", str(elf)], capture_output=True, text=True)
        if link.returncode:
            raise RuntimeError(link.stderr)
        binf = d / "gate.bin"
        subprocess.run(["llvm-objcopy", "-O", "binary", str(elf), str(binf)], check=True)
        self.code = binf.read_bytes()
        nm = subprocess.run(["llvm-nm", str(elf)], check=True, capture_output=True, text=True).stdout.split("\n")
        self.sym = {l.split()[2]: int(l.split()[0], 16) for l in nm if len(l.split()) == 3}
        self.dir = d



def _udivmod(uc):
    a = uc.reg_read(UC_ARM_REG_R0) | (uc.reg_read(UC_ARM_REG_R1) << 32)
    b = uc.reg_read(UC_ARM_REG_R2) | (uc.reg_read(UC_ARM_REG_R3) << 32)
    q, r = divmod(a, b)
    for reg, v in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2, UC_ARM_REG_R3),
                      (q & 0xFFFFFFFF, q >> 32, r & 0xFFFFFFFF, r >> 32)):
        uc.reg_write(reg, v)


class Emu:
    def __init__(self, img, k=4, hangover=10):
        self.img = img
        self.uc = Uc(UC_ARCH_ARM, UC_MODE_THUMB | UC_MODE_MCLASS)
        self.uc.mem_map(BASE, REGION - BASE)
        self.uc.mem_write(BASE, img.code)
        self.count = 0
        self.divs = 0
        self.uc.hook_add(UC_HOOK_CODE, self._hook)
        self._call("bench_init", k, hangover)

    def _hook(self, uc, addr, size, _):
        if addr & ~1 == UDIVMOD:
            _udivmod(uc)
            self.divs += 1
            uc.reg_write(UC_ARM_REG_PC, uc.reg_read(UC_ARM_REG_LR) | 1)   # return to the caller, not counted
            return
        self.count += 1

    def _call(self, name, *args):
        uc = self.uc
        uc.reg_write(UC_ARM_REG_SP, STACK_TOP)
        for reg, v in zip((UC_ARM_REG_R0, UC_ARM_REG_R1, UC_ARM_REG_R2), args):
            uc.reg_write(reg, v)
        uc.reg_write(UC_ARM_REG_LR, END_ADDR | 1)
        uc.emu_start(self.img.sym[name] | 1, END_ADDR)
        return uc.reg_read(UC_ARM_REG_R0)

    def push(self, frame):
        """One 20 ms frame (int16 array). Returns (open, floor, instructions executed, libcalls)."""
        buf = 0x70000
        self.uc.mem_write(buf, np.asarray(frame, dtype="<i2").tobytes())
        c0, d0 = self.count, self.divs
        o = self._call("bench_push", buf, len(frame)) & 0xFFFFFFFF
        n, divs = self.count - c0, self.divs - d0
        return o, self._call("bench_floor"), n, divs
