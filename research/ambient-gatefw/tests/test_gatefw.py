import shutil

import numpy as np
import pytest

from ambient_gatefw.ref import FRAME, adaptive_gate, block_floor, frame_ms, noise_floor, synth
from ambient_gatefw import native

pytestmark = pytest.mark.skipif(not shutil.which("gcc"), reason="needs gcc")


@pytest.fixture(scope="module")
def stream():
    x, act = synth(60, -45, seed=11)
    return x, act, frame_ms(x)


def test_exact_build_matches_python_gate_and_floor(stream):
    x, _, ms = stream
    op, fl = native.run(native.build(1), x, FRAME, 4, 10)
    assert (fl == np.maximum(noise_floor(ms, 250), 0)).all()
    assert (op == adaptive_gate(ms, 4, 10)).all()


def test_block_build_matches_block_reference(stream):
    x, _, ms = stream
    for block in (2, 5, 10, 25):
        op, fl = native.run(native.build(block), x, FRAME, 4, 10)
        ref = block_floor(ms, block)
        assert (fl == ref).all()
        thr = 4 * np.maximum(ref, 1)
        left, exp = 0, []
        for a in ms >= thr:
            left = 11 if a else left
            exp.append(left > 0)
            left = max(0, left - 1)
        assert (op == np.array(exp)).all()


def test_block_floor_is_never_below_exact_and_close(stream):
    _, _, ms = stream
    exact = noise_floor(ms, 250)
    blk = block_floor(ms, 10)
    # the block window is 241-250 frames, a subset of the exact one, so its minimum is >= the exact one
    assert (blk >= exact).all()
    assert (block_floor(ms, 1) == exact).all()


def test_ram_shrinks_with_block():
    sizes = {b: native.build(b).harness_sizeof() for b in (1, 10, 25)}
    for b, size in sizes.items():
        assert size == 4 * (250 // b - 1) + 24      # ring of uint32 block minima + 24 bytes of state


def test_compare_count_matches_ring_fill(stream):
    x, _, _ = stream
    nf = len(x) // FRAME
    for block in (1, 10):
        lib = native.build(block, count=True)
        native.run(lib, x, FRAME, 4, 10)
        ring = 250 // block - 1
        # finished blocks before frame i is i // block, capped at the ring size
        expect = sum(min(i // block, ring) for i in range(nf))
        assert lib.harness_compares() == expect


def test_zero_energy_frame_does_not_open_gate_and_floor_is_clamped():
    x = np.zeros(FRAME * 30, dtype=np.int16)
    op, fl = native.run(native.build(1), x, FRAME, 4, 10)
    assert not op.any() and (fl == 0).all()
