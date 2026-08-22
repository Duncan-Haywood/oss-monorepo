"""The CSS reader — mostly tests that it refuses to answer.

Nearly every assertion here is about something the reader declines to resolve.
That is the point: it feeds an accessibility checker, where a confidently wrong
colour becomes a false failure sent to a stranger.
"""

from wcag_triage.css import (
    DARK,
    LIGHT,
    Stylesheet,
    general_conditionals,
    orientation_conditionals,
    orientation_of,
    parse_stylesheet,
    scheme_of,
    scheme_value,
    unescape_selector,
)


def test_reads_a_single_class_rule():
    sheet = parse_stylesheet(".a{color:#123456}")
    assert sheet.property_for("a", "color").value == "#123456"


def test_skips_selectors_it_cannot_reason_about():
    sheet = parse_stylesheet(
        ".card p{color:red}"
        ".btn:hover{color:red}"
        "#id{color:red}"
        "[data-theme] .x{color:red}"
        ".a.b{color:red}"
        ".a > .b{color:red}"
    )
    assert sheet.classes == {}


def test_type_selectors_are_kept_separately():
    sheet = parse_stylesheet("h1{font-size:2rem}")
    assert sheet.element_property_for("h1", "font-size").value == "2rem"
    assert "h1" not in sheet.classes


def test_escaped_class_names_are_unescaped():
    assert unescape_selector(r"bg-white\/90") == "bg-white/90"
    sheet = parse_stylesheet(r".bg-white\/90{background-color:#ffffffe6}")
    assert sheet.property_for("bg-white/90", "background-color").value == "#ffffffe6"


def test_an_escaped_comma_does_not_split_the_selector():
    """A Tailwind arbitrary value escapes its own commas into the class name.

    Splitting the selector list on every comma shredded such a rule into
    fragments, none of which parsed as a single class, so the declaration was
    dropped — and a dropped rule is indistinguishable from a property the page
    never set, so the element was scored against a background it did not have.
    The values that carry commas are `rgba()` and every gradient, so the loss
    landed squarely on backgrounds. See
    `portfolio/research/a11y-delivered-contrast/`.
    """
    sheet = parse_stylesheet(
        r".bg-\[linear-gradient\(\#ffffff_0\%\,_\#000000_100\%\)\]"
        r"{background-image:linear-gradient(#ffffff 0%, #000000 100%)}"
    )
    entry = sheet.property_for("bg-[linear-gradient(#ffffff_0%,_#000000_100%)]", "background-image")
    assert entry is not None
    assert entry.value == "linear-gradient(#ffffff 0%, #000000 100%)"


def test_a_separating_comma_still_splits_the_selector():
    sheet = parse_stylesheet(".a,.b{color:#123456}")
    assert sheet.property_for("a", "color").value == "#123456"
    assert sheet.property_for("b", "color").value == "#123456"


def test_commas_inside_brackets_and_quotes_are_not_separators():
    sheet = parse_stylesheet('[title="a,b"],.c{color:#123456}')
    assert sheet.property_for("c", "color").value == "#123456"


def test_layer_is_transparent_but_media_is_not():
    sheet = parse_stylesheet("@layer utilities{.a{color:red}}@media (min-width:40rem){.a{color:blue}}")
    entry = sheet.property_for("a", "color")
    assert entry.value == "red"
    assert [declaration.value for declaration in entry.conditional] == ["blue"]


def test_source_order_decides_between_equal_specificity_classes():
    sheet = parse_stylesheet(".a{color:red}.b{color:blue}")
    assert sheet.property_for("a", "color").order < sheet.property_for("b", "color").order


def test_var_expansion_and_fallback():
    sheet = parse_stylesheet(":root{--x:#abcdef}.a{color:var(--x)}.b{color:var(--missing, #123)}")
    assert sheet.resolve_all("a", "color")[0] == "#abcdef"
    assert sheet.resolve_all("b", "color")[0] == "#123"


def test_var_that_is_defined_nowhere_does_not_resolve():
    sheet = parse_stylesheet(".a{color:var(--nope)}")
    assert sheet.resolve_all("a", "color")[0] is None


def test_scheme_of_only_matches_a_bare_colour_scheme_query():
    assert scheme_of("@media (prefers-color-scheme:dark)") == DARK
    assert scheme_of("@media (prefers-color-scheme: light)") == LIGHT
    assert scheme_of("@media (min-width:40rem)") is None
    # A compound query still needs the viewport, so it stays undecidable.
    assert scheme_of("@media (min-width:40rem) and (prefers-color-scheme:dark)") is None


def test_a_dark_scheme_override_resolves_per_scheme():
    sheet = parse_stylesheet(
        ":root{--bg:#ffffff}"
        "@media (prefers-color-scheme:dark){:root{--bg:#0a0a0a}}"
        "body{background:var(--bg)}"
    )
    assert sheet.resolve_element("body", "background", LIGHT)[0] == "#ffffff"
    assert sheet.resolve_element("body", "background", DARK)[0] == "#0a0a0a"


def test_breakpoint_conditionals_stay_variants_not_overrides():
    sheet = parse_stylesheet(".a{color:red}@media (min-width:40rem){.a{color:blue}}")
    primary, variants = sheet.resolve_all("a", "color", LIGHT)
    assert primary == "red"
    assert variants == ["blue"]
    # And the scheme resolver must not claim a breakpoint value applies.
    assert scheme_value(sheet.property_for("a", "color"), DARK) is None
    assert general_conditionals(sheet.property_for("a", "color")) == ["blue"]


def test_orientation_of_only_matches_a_bare_orientation_query():
    assert orientation_of("@media (orientation: portrait)") == "portrait"
    assert orientation_of("@media (orientation:landscape)") == "landscape"
    assert orientation_of("@media (min-width:40rem)") is None
    # A compound query still needs the viewport, so it stays undecidable.
    assert orientation_of("@media (min-width:40rem) and (orientation:portrait)") is None
    # Nonsensical, but must refuse rather than crash or pick one.
    assert orientation_of("@media (orientation:portrait) and (orientation:landscape)") is None


def test_orientation_conditionals_pairs_the_orientation_with_its_value():
    sheet = parse_stylesheet(
        "@media (orientation: portrait) { html { transform: rotate(90deg); } }"
        "@media (min-width: 40rem) { html { transform: scale(2); } }"
    )
    entry = sheet.element_property_for("html", "transform")
    assert orientation_conditionals(entry) == [("portrait", "rotate(90deg)")]
    # The breakpoint conditional is not an orientation and is excluded here,
    # but `general_conditionals` does not know about orientation either -- it
    # only excludes colour schemes -- so it still reports both values.
    assert general_conditionals(entry) == ["rotate(90deg)", "scale(2)"]


def test_comments_and_nested_rules_do_not_leak_declarations():
    sheet = parse_stylesheet("/* .a{color:red} */ .b{color:blue;&:hover{color:green}}")
    assert "a" not in sheet.classes
    assert sheet.property_for("b", "color").value == "blue"


def test_appending_a_second_source_keeps_later_rules_later():
    sheet = Stylesheet()
    parse_stylesheet(".a{color:red}", sheet)
    parse_stylesheet(".b{color:blue}", sheet)
    assert sheet.property_for("b", "color").order > sheet.property_for("a", "color").order
