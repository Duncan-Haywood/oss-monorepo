"""Build firmware/gate_simd.c (variants 1 and 2) or the unchanged ambient-gatefw gate (variant 0) for
Cortex-M4 with clang and return an image that ambient_gatem4.m4.Emu can run in Unicorn."""
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(HERE.parent / "ambient-gatem4" / "src"))
sys.path.insert(0, str(HERE.parent / "ambient-gatefw" / "src"))
from ambient_gatem4 import m4  # noqa: E402

SIMD = HERE / "firmware" / "gate_simd.c"


class Image(m4.Image):
    """variant 0 = ambient-gatefw as is; 1 = SMLALD energy loop; 2 = SMLALD and no divide."""

    def __init__(self, variant, block, opt="Os"):
        if variant == 0:
            super().__init__(block, opt)
            self.variant = 0
            return
        self.variant, self.block, self.opt = variant, block, opt
        d = Path(tempfile.mkdtemp(prefix="gatesimd-"))
        o = d / "gate_simd.o"
        subprocess.run(["clang", *m4.TARGET, f"-{opt}", f"-DAGATE_BLOCK={block}", f"-DGATE_VARIANT={variant}",
                        "-c", str(SIMD), "-o", str(o)], check=True)
        sz = subprocess.run(["llvm-size", str(o)], check=True, capture_output=True, text=True).stdout.split("\n")[1].split()
        self.text_bytes = int(sz[0])
        und = subprocess.run(["llvm-nm", "-u", str(o)], check=True, capture_output=True, text=True).stdout.split()
        self.libcalls = sorted(set(und) - {"U"})
        elf = d / "gate.elf"
        link = subprocess.run(["ld.lld", f"-Ttext={m4.BASE:#x}", "-e", "0", f"--defsym=__aeabi_uldivmod={m4.UDIVMOD:#x}",
                               str(o), "-o", str(elf)], capture_output=True, text=True)
        if link.returncode:
            raise RuntimeError(link.stderr)
        binf = d / "gate.bin"
        subprocess.run(["llvm-objcopy", "-O", "binary", str(elf), str(binf)], check=True)
        self.code = binf.read_bytes()
        nm = subprocess.run(["llvm-nm", str(elf)], check=True, capture_output=True, text=True).stdout.split("\n")
        self.sym = {l.split()[2]: int(l.split()[0], 16) for l in nm if len(l.split()) == 3}
        self.dir = d


Emu = m4.Emu
have_tools = m4.have_tools
