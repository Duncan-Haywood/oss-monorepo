import golive
import pytest


def make(tmp_path, slugs=("a", "b")):
    for s in slugs:
        d = tmp_path / "ventures" / s
        d.mkdir(parents=True)
        (d / "checkout.mjs").write_text(
            '// c\nexport const CHECKOUT_URL = "";\nexport const VALIDATE_URL = "https://x/v";\n')
    (tmp_path / "ventures" / "none").mkdir()
    return tmp_path


def test_status_lists_only_checkout_ventures(tmp_path):
    r = make(tmp_path)
    assert [x[0] for x in golive.status(r)] == ["a", "b"]


def test_set_all_and_unset(tmp_path):
    r = make(tmp_path)
    assert golive.main(["set", "https://pay.example/buy"], r) == 0
    assert all(u == "https://pay.example/buy" for _, u, _ in golive.status(r))
    assert "VALIDATE_URL" in (r / "ventures/a/checkout.mjs").read_text()
    golive.main(["unset", "a"], r)
    st = {s: u for s, u, _ in golive.status(r)}
    assert st["a"] == "" and st["b"] != ""


def test_per_venture(tmp_path):
    r = make(tmp_path)
    assert golive.main(["set", "b=https://pay.example/b"], r) == 0
    assert {s: u for s, u, _ in golive.status(r)} == {"a": "", "b": "https://pay.example/b"}


@pytest.mark.parametrize("bad", ['http://x.com', 'https://x.com/a"b', 'https://x .com', 'javascript:1', 'https://x.com/<s>'])
def test_refuses_unsafe(tmp_path, bad):
    r = make(tmp_path)
    assert golive.main(["set", bad], r) == 2
    assert all(u == "" for _, u, _ in golive.status(r))


def test_unknown_slug(tmp_path):
    r = make(tmp_path)
    assert golive.main(["set", "zzz=https://x.com"], r) == 2
