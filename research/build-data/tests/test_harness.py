import os, sys, csv, tempfile
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
import harness as H


def test_quantile_hand_counts():
    xs = [1, 2, 3, 4]            # position (n-1)p = 3p
    assert H.quantile(xs, 0.5) == 2.5      # between 2 and 3
    assert H.quantile(xs, 0.0) == 1 and H.quantile(xs, 1.0) == 4
    assert abs(H.quantile(xs, 0.9) - 3.7) < 1e-12   # 3 + 0.7*(4-3)
    assert H.quantile([7], 0.9) == 7
    assert H.quantile([0, 0, 0, 10], 0.5) == 0      # zero-inflated median is 0


def test_pinball_hand_counts():
    assert H.pinball(10, 4, 0.9) == 0.9 * 6         # under-prediction costs tau
    assert abs(H.pinball(4, 10, 0.9) - 0.1 * 6) < 1e-12   # over-prediction costs 1-tau
    assert H.pinball(5, 5, 0.5) == 0


def _write(rows):
    f = tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False, newline="")
    w = csv.DictWriter(f, ["permit_type", "applied", "issued", "completed"])
    w.writeheader(); w.writerows(rows); f.close()
    return f.name


def test_load_drops_negative_and_missing():
    p = _write([dict(permit_type="a", applied="2020-01-10", issued="2020-01-12", completed=""),
                dict(permit_type="a", applied="2020-01-10", issued="2020-01-09", completed=""),
                dict(permit_type="a", applied="", issued="2020-01-09", completed="")])
    rows, neg = H.load(p, "a2i")
    assert [r["y"] for r in rows] == [2] and neg == 1


def test_split_is_forward_in_time():
    rows = [dict(type="a", start=f"{y}-03-01", y=1) for y in (2018, 2019, 2020, 2021, 2022)]
    tr, ca, te = H.split(rows, 2022)
    assert [r["start"][:4] for r in tr] == ["2018", "2019", "2020"]
    assert [r["start"][:4] for r in ca] == ["2021"] and [r["start"][:4] for r in te] == ["2022"]


def test_reference_class_falls_back_for_rare_types():
    rows = [dict(type="a", start="2019-01-01", y=y) for y in range(100)] + \
           [dict(type="rare", start="2019-01-01", y=1000)]
    m = H.ReferenceClass(rows, min_n=30)
    assert m.predict("rare") == m.glob and m.predict("a")[0.5] == 49.5


def test_run_on_zero_inflated_data_and_same_day_split():
    # train 2018: 70% zeros, rest 10; test 2020 identical shape
    mk = lambda yr: [dict(type="a", start=f"{yr}-0{1 + i % 9}-05", y=0 if i % 10 < 7 else 10) for i in range(100)]
    rows = mk(2018) + mk(2020)
    res = H.run(rows, 2020)
    assert res["share_same_day_test"] == 0.7
    # model predicts 0 at tau .1 and .5, 10 at tau .9. Hand count: 30% of rows have y=10,
    # costing .1*10 (tau .1) and .5*10 (tau .5); 70% have y=0 against q=10 at tau .9: .1*10.
    assert abs(res["pinball"]["0.1"] - 0.3) < 1e-12 and abs(res["pinball"]["0.5"] - 1.5) < 1e-12
    assert abs(res["pinball"]["0.9"] - 0.7) < 1e-12
    assert res["tail_pinball_y_gt_0"]["0.9"] == 0
    assert res["coverage_80"] == 1.0
    # same-day mass: taus .1 and .5 have quantile 0 -> pz = .5, so every row has Brier .25
    assert abs(res["brier_same_day"] - 0.25) < 1e-12


def test_bootstrap_detects_a_constant_gap():
    a = [dict(start=f"2020-01-{d:02d}", v=2.0) for d in range(1, 29)]
    b = [dict(start=x["start"], v=1.0) for x in a]
    r = H.week_block_bootstrap(a, b, n_boot=200)
    assert r["diff"] == 1.0 and r["lo"] == 1.0 and r["hi"] == 1.0
