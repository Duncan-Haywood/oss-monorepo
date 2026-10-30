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


def test_shingles_are_exact_five_word_windows():
    s = ps.shingles("a b c d e f g")
    assert s == {("a", "b", "c", "d", "e"), ("b", "c", "d", "e", "f"), ("c", "d", "e", "f", "g")}
    assert ps.shingles("a b c d") == set()
    assert ps.shingles("a b c d e") == {("a", "b", "c", "d", "e")}


def test_pairs_sorted_most_similar_first():
    base = " ".join(f"w{i}" for i in range(40))
    mid = " ".join(f"w{i}" for i in range(20)) + " " + " ".join(f"q{i}" for i in range(20))
    out = ps.similar_pairs({"a.md": base, "b.md": base, "c.md": mid}, 0.1)
    scores = [c for c, _, _ in out]
    assert len(scores) == 3 and scores == sorted(scores, reverse=True) and scores[0] > scores[-1]


def test_threshold_is_inclusive():
    # 4 shared of 8 shingles in the smaller post = containment exactly 0.5.
    a = " ".join(f"w{i}" for i in range(12))
    b = " ".join(f"w{i}" for i in range(8)) + " " + " ".join(f"q{i}" for i in range(8))
    c = ps.containment(ps.shingles(a), ps.shingles(b))
    assert c == 0.5
    assert len(ps.similar_pairs({"a.md": a, "b.md": b}, 0.5)) == 1
    assert ps.similar_pairs({"a.md": a, "b.md": b}, 0.51) == []
