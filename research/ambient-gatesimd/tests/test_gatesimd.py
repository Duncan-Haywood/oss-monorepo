import sys
from pathlib import Path

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from ambient_gatesimd.build import Emu, Image, have_tools  # noqa: E402
from ambient_gatefw.ref import FRAME, adaptive_gate, block_floor, frame_ms, synth  # noqa: E402

pytestmark = pytest.mark.skipif(not have_tools(), reason="needs clang, ld.lld, llvm binutils and unicorn")


@pytest.fixture(scope="module")
def stream():
    x, _ = synth(30, -45, seed=3)
    return x, frame_ms(x)


def run(variant, block, x):
    e = Emu(Image(variant, block), k=4, hangover=10)
    return np.array([e.push(x[i * FRAME:(i + 1) * FRAME]) for i in range(len(x) // FRAME)], dtype=np.int64)


def test_smlald_variant_is_bit_exact(stream):
    x, ms = stream
    r = run(1, 1, x)
    assert (r[:, 0] == adaptive_gate(ms, 4, 10)).all()
    r10 = run(1, 10, x)
    assert (r10[:, 1] == block_floor(ms, 10)).all()


def test_divide_free_variant_has_no_libcall_and_fewer_instructions(stream):
    x, _ = stream
    assert Image(2, 10).libcalls == []
    assert Image(1, 10).libcalls == ["__aeabi_uldivmod"]
    assert run(1, 10, x)[100:, 2].mean() < 0.9 * run(0, 10, x)[100:, 2].mean()


def test_divide_free_decisions_mostly_match(stream):
    x, ms = stream
    r = run(2, 1, x)
    ref = adaptive_gate(ms, 4, 10)
    assert (r[:, 0] != ref).mean() < 0.02
    assert (r[:, 3] == 0).all()
