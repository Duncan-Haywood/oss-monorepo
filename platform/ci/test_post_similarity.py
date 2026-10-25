import post_similarity as ps

A = "---\ntitle: a\n---\n" + " ".join(f"w{i}" for i in range(40))
B = "---\ntitle: b\n---\n" + " ".join(f"w{i}" for i in range(30)) + " other words appear here now and then"
C = "---\ntitle: c\n---\n" + " ".join(f"z{i}" for i in range(40))


def test_front_matter_and_fences_dropped():
    t = "---\ntitle: x\n---\nhello there general kenobi you are\n```\nsecret code block here now ok\n```\n"
    assert ps.shingles(t) == ps.shingles("hello there general kenobi you are")


def test_containment_uses_smaller_post():
    assert ps.containment({1, 2}, {1, 2, 3, 4}) == 1.0
    assert ps.containment(set(), {1}) == 0.0


def test_pairs_found_and_sorted():
    out = ps.similar_pairs({"a.md": A, "b.md": B, "c.md": C}, 0.5)
    assert [(x, y) for _, x, y in out] == [("a.md", "b.md")]


def test_main_exit_codes(tmp_path):
    d = tmp_path / "docs" / "posts"
    d.mkdir(parents=True)
    (d / "a.md").write_text(A)
    (d / "b.md").write_text(B)
    assert ps.main(["--root", str(tmp_path)]) == 0
    assert ps.main(["--root", str(tmp_path), "--fail"]) == 1
