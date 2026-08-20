from wcag_triage.parser import parse


def _first(root, tag):
    return next(n for n in root.iter() if n.tag == tag)


def test_builds_nested_tree():
    root = parse("<div><p>hello <b>world</b></p></div>")
    div = _first(root, "div")
    p = _first(root, "p")
    assert p.parent is div
    assert p.accessible_text() == "hello world"


def test_void_elements_take_no_children():
    root = parse("<p><img src='x'>after</p>")
    p = _first(root, "p")
    img = _first(root, "img")
    # img is a child of p, and 'after' is text of p, not of img.
    assert img.parent is p
    assert img.children == []
    assert "after" in p.accessible_text()


def test_aria_hidden_text_is_not_accessible():
    root = parse('<a href="/x"><span aria-hidden="true">icon</span></a>')
    a = _first(root, "a")
    assert a.accessible_text() == ""


def test_tolerates_unclosed_tags():
    # Should not raise.
    root = parse("<ul><li>one<li>two</ul>")
    items = [n for n in root.iter() if n.tag == "li"]
    assert len(items) == 2


def test_attrs_without_value_become_empty_string():
    root = parse("<input disabled>")
    inp = _first(root, "input")
    assert inp.attrs["disabled"] == ""
    assert inp.has_attr("disabled")
