import shutil
import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "ambient-gatefw" / "src"))
from ambient_gatefw.ref import FRAME, adaptive_gate, block_floor, frame_ms, noise_floor, synth  # noqa: E402
from ambient_gatem4.m4 import Emu, Image, have_tools  # noqa: E402

pytestmark = pytest.mark.skipif(not have_tools(), reason="needs clang, ld.lld and llvm binutils")


@pytest.fixture(scope="module")
def stream():
    x, _ = synth(30, -45, seed=3)
    return x, frame_ms(x)


def run(block, x, opt="Os"):
    e = Emu(Image(block, opt), k=4, hangover=10)
    out = [e.push(x[i * FRAME:(i + 1) * FRAME]) for i in range(len(x) // FRAME)]
    return np.array(out, dtype=np.int64)


def test_thumb_build_matches_python_reference(stream):
    x, ms = stream
    for block in (1, 10):
        r = run(block, x)
        assert (r[:, 1] == block_floor(ms, block)).all()
    r = run(1, x)
    assert (r[:, 0] == adaptive_gate(ms, 4, 10)).all()
    assert (r[:, 1] == np.maximum(noise_floor(ms, 250), 0)).all()


def test_only_libcall_is_the_64_bit_divide():
    assert Image(10).libcalls == ["__aeabi_uldivmod"]


def test_one_divide_per_frame_and_cost_falls_with_block(stream):
    x, _ = stream
    r1, r10 = run(1, x), run(10, x)
    assert (r1[:, 3] == 1).all() and (r10[:, 3] == 1).all()
    assert r10[len(r10) // 2:, 2].mean() < 0.75 * r1[len(r1) // 2:, 2].mean()
