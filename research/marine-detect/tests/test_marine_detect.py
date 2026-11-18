import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from marine_detect import data, degrade, metrics  # noqa: E402
from marine_detect.data import IGNORE, OBSTACLE, SKY, WATER  # noqa: E402


def scene():
    """Sky on top, water below, a 4x4 buoy in the water and a shore strip touching the left edge."""
    gt = np.full((40, 60), WATER, np.uint8)
    gt[:15] = SKY
    gt[25:29, 30:34] = OBSTACLE  # floating
    gt[15:20, 0:20] = OBSTACLE  # shore: touches frame and sky
    return gt


def test_split_keeps_blocks_together():
    ids = [f"{i:04d}" for i in range(1, 400)]
    tr, te = data.split(ids)
    assert set(tr).isdisjoint(te) and len(tr) + len(te) == len(ids)
    blocks_te = {data.block_key(i) for i in te}
    assert all(data.block_key(i) not in blocks_te for i in tr)


def test_block_key_prefixes():
    assert data.block_key("0026") == "1"
    assert data.block_key("old_0026") == "old_1"
    assert data.block_key("old_00001150L") == "old_L46"


def test_verify_archive_rejects_other_bytes(tmp_path):
    import pytest
    f = tmp_path / "MaSTr1325_masks_512x384.zip"
    f.write_bytes(b"not the archive")
    with pytest.raises(ValueError, match="not the pinned"):
        data.verify_archive(f)
    with pytest.raises(ValueError, match="no pinned"):
        data.verify_archive(tmp_path / "other.zip")


def test_remap_ignores_unknown():
    m = np.array([[0, 1, 2, 4]], np.uint8)
    assert data.remap(m).tolist() == [[0, 1, 2, IGNORE]]


def test_fog_limits_and_koschmieder():
    x = np.random.default_rng(0).random((3, 4, 4)).astype(np.float32)
    assert np.allclose(degrade.fog(x, 1.0), x)
    assert np.allclose(degrade.fog(x, 1e-9), 0.8, atol=1e-6)
    # 2% contrast threshold: transmission 0.02 is exactly the visibility range
    assert math.isclose(degrade.range_over_visibility(0.02), 1.0, rel_tol=1e-3)


def test_fog_midpoint_is_affine_toward_airlight():
    x = np.full((3, 2, 2), 0.2, np.float32)
    assert np.allclose(degrade.fog(x, 0.5), 0.2 * 0.5 + 0.8 * 0.5)


def test_aggregate_t_interval():
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "experiments"))
    import aggregate
    m, hw = aggregate.ms([0.3, 0.35, 0.4])
    assert math.isclose(m, 0.35) and math.isclose(hw, 4.303 * 0.05 / math.sqrt(3), rel_tol=1e-9)


def test_glint_only_brightens_and_saturates():
    gt = scene()
    x = np.full((3, 40, 60), 0.5, np.float32)
    g = degrade.glint(x, gt, 0.9, seed=1)
    assert (g >= x - 1e-7).all() and g.max() <= 1.0 and g.max() > 0.9


def test_floating_obstacle_excludes_shore():
    gt = scene()
    obs = list(metrics.floating_obstacles(gt))
    assert len(obs) == 1 and obs[0][1] == 16


def test_diagonal_line_is_one_obstacle():
    """A thin diagonal pole is one 8-connected object, not eight 1-px ones (audit 2026-11-17)."""
    gt = scene()
    for k in range(8):
        gt[22 + k, 40 + k] = OBSTACLE
    obs = sorted(a for _, a in metrics.floating_obstacles(gt))
    assert obs == [8, 16]
    old = sorted(a for _, a in metrics.floating_obstacles(gt, connectivity=4, min_area=1))
    assert old == [1] * 8 + [16]


def test_min_area_floor_is_symmetric():
    """Objects under MIN_AREA px are dropped on the ground-truth side as on the false-alarm side."""
    assert metrics.MIN_AREA == 4
    gt = scene()
    gt[33:34, 10:13] = OBSTACLE  # 3 px: below the floor
    gt[33:35, 45:47] = OBSTACLE  # 4 px: counted
    areas = sorted(a for _, a in metrics.floating_obstacles(gt))
    assert areas == [4, 16]
    pred = scene()
    pred[36:37, 10:13] = OBSTACLE  # 3-px blob on water: not an alarm
    assert metrics.false_alarms(pred, gt) == 0
    pred[36:38, 20:22] = OBSTACLE  # 4-px blob on water: an alarm
    assert metrics.false_alarms(pred, gt) == 1


def test_false_alarm_diagonal_blob_counts_once():
    gt = scene()
    pred = gt.copy()
    for k in range(5):
        pred[32 + k, 40 + k] = OBSTACLE
    assert metrics.false_alarms(pred, gt) == 1
    assert metrics.false_alarms(pred, gt, connectivity=4) == 0  # five 1-px blobs, each under the floor


def test_found_threshold_is_half_cover():
    gt = scene()
    pred = gt.copy()
    pred[25:27, 30:34] = WATER  # 8 of 16 covered: exactly half is found
    assert metrics.obstacle_recall(pred, gt) == [(16, True)]
    pred[27, 30] = WATER  # 7 of 16: missed
    assert metrics.obstacle_recall(pred, gt) == [(16, False)]


def test_mostly_shore_ring_is_not_floating():
    gt = np.full((40, 60), WATER, np.uint8)
    gt[:15] = SKY
    gt[15:17, 10:50] = OBSTACLE  # shoreline strip not touching the frame edge, ring half sky
    gt[14, 5:55] = OBSTACLE  # joins it to a strip above: ring mostly sky
    assert list(metrics.floating_obstacles(gt)) == []


def test_recall_and_false_alarms():
    gt = scene()
    pred = gt.copy()
    assert metrics.obstacle_recall(pred, gt) == [(16, True)]
    assert metrics.false_alarms(pred, gt) == 0
    pred[25:29, 30:34] = WATER
    pred[35:38, 50:53] = OBSTACLE  # a 9-pixel blob on open water
    assert metrics.obstacle_recall(pred, gt) == [(16, False)]
    assert metrics.false_alarms(pred, gt) == 1


def test_iou_perfect():
    gt = scene()
    assert np.allclose(metrics.iou(metrics.confusion(gt, gt)), 1.0)


def test_binned_recall():
    pairs = [(10, True), (10, False), (300, True)]
    b = metrics.binned_recall(pairs)
    assert b[0][2:] == (2, 0.5) and b[2][2:] == (1, 1.0) and math.isnan(b[1][3])


def test_floating_obstacle_through_unknown_margin():
    gt = scene()
    gt[24:30, 29:35] = IGNORE
    gt[25:29, 30:34] = OBSTACLE
    obs = list(metrics.floating_obstacles(gt))
    assert len(obs) == 1 and obs[0][1] == 16
