import shutil
import subprocess
from pathlib import Path

import pytest

FW = Path(__file__).resolve().parents[1] / "firmware"


@pytest.mark.skipif(shutil.which("gcc") is None, reason="no host gcc")
def test_host_build_and_run(tmp_path):
    exe = tmp_path / "t"
    subprocess.run(["gcc", "-std=c99", "-Wall", "-Wextra", "-Werror", "-o", str(exe),
                    str(FW / "vad_gate.c"), str(FW / "test_vad_gate.c")], check=True)
    out = subprocess.run([str(exe)], check=True, capture_output=True, text=True).stdout
    assert "passed" in out


@pytest.mark.skipif(shutil.which("arm-none-eabi-gcc") is None, reason="no ARM gcc")
def test_cortex_m4_compiles(tmp_path):
    subprocess.run(["arm-none-eabi-gcc", "-std=c99", "-Wall", "-Wextra", "-Werror", "-Os",
                    "-mcpu=cortex-m4", "-mthumb", "-mfloat-abi=hard", "-mfpu=fpv4-sp-d16",
                    "-c", str(FW / "vad_gate.c"), "-o", str(tmp_path / "v.o")], check=True)
    assert (tmp_path / "v.o").stat().st_size > 0
