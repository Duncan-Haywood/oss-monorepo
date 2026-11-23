"""src/foldcheck.py: the fold point of a radial distortion model, against the image corners."""
import importlib.util, json, math, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))


def _load(name, rel):
    s = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", rel))
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


fc = _load("foldcheck", "src/foldcheck.py")
m3zd = _load("m3zd_an_fc", "experiments/m3zd_edge/analyse.py")


def test_analytic_k2_only_peak():
    # rho = x (1 + k2 x^4), k2 < 0: peak where 1 + 5 k2 x^4 = 0
    k2 = -0.5
    x = (1 / 2.5) ** 0.25
    assert abs(fc.fold_x(0.0, k2) - x) < 1e-9
    assert abs(fc.rho(x, 0.0, k2) - x * (1 + k2 * x ** 4)) < 1e-12


def test_monotone_models_never_fold():
    assert fc.fold_x(0.0, 0.0) is None
    assert fc.fold_x(0.1, 0.0) is None
    assert fc.fold_x(0.0, 0.07) is None
    assert fc.fold_x(0.2624, -0.9531, 1.1633) is None          # TUM's fr1 (three terms)


def test_negative_k1_barrel_folds_where_the_closed_form_says():
    k1 = -0.3                                                  # 1 + 3 k1 x^2 = 0
    assert abs(fc.fold_x(k1, 0.0) - math.sqrt(1 / 0.9)) < 1e-9


def test_agrees_with_the_dense_scan_of_milestone_3zd_on_every_reference_and_random_models():
    refs = m3zd.m3za.references()
    for t in refs:
        for u, m in refs[t].items():
            want = m3zd.fold_radius(m, xmax=3.0, n=300001)
            xs = fc.fold_x(m["k1"], m["k2"], m.get("k3", 0.0))
            got = None if xs is None else m["f"] * fc.rho(xs, m["k1"], m["k2"], m.get("k3", 0.0))
            if want is None:
                assert got is None or xs > 3.0, (t, u, got)
            else:
                assert abs(got - want) < 0.05, (t, u, got, want)
    rng = np.random.default_rng(3)
    for _ in range(300):
        k1, k2, k3 = rng.uniform(-1, 1), rng.uniform(-2, 2), rng.uniform(-2, 2)
        m = {"f": 1.0, "k1": k1, "k2": k2, "k3": k3}
        want = m3zd.fold_radius(m, xmax=2.0, n=200001)
        xs = fc.fold_x(k1, k2, k3)
        if want is None:
            assert xs is None or xs > 2.0 - 1e-4
        else:
            assert abs(fc.rho(xs, k1, k2, k3) - want) < 1e-4


def test_kinect_board_fit_folds_inside_its_image_and_tum_does_not(tmp_path):
    b = json.load(open(os.path.join(HERE, "..", "experiments", "m3i_principal", "tum_summary.json")))["board_reference"]["fr1"]
    r = fc.check(b["f"], b["f"], b["cx"], b["cy"], 640, 480, b["k1"], b["k2"])
    assert r["folds_inside"] and abs(r["fold_radius_px"] - 381) < 1
    assert fc.main(["--fx", str(b["f"]), "--cx", str(b["cx"]), "--cy", str(b["cy"]), "--k1", str(b["k1"]),
                    "--k2", str(b["k2"]), "--width", "640", "--height", "480"]) == 1
    p = tmp_path / "tum.json"
    p.write_text(json.dumps({"K": [[517.3, 0, 318.6], [0, 516.5, 255.3], [0, 0, 1]],
                             "D": [0.2624, -0.9531, 0, 0, 1.1633], "size": [640, 480]}))
    assert fc.main(["--json", str(p)]) == 0
    p.write_text(json.dumps({"K": [[500, 0, 320], [0, 500, 240], [0, 0, 1]], "D": [0, 0, 0, 0, 0, 0.1, 0, 0], "size": [640, 480]}))
    assert fc.main(["--json", str(p)]) == 2
