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


def test_comments_and_nested_rules_do_not_leak_declarations():
    sheet = parse_stylesheet("/* .a{color:red} */ .b{color:blue;&:hover{color:green}}")
    assert "a" not in sheet.classes
    assert sheet.property_for("b", "color").value == "blue"


def test_appending_a_second_source_keeps_later_rules_later():
    sheet = Stylesheet()
    parse_stylesheet(".a{color:red}", sheet)
    parse_stylesheet(".b{color:blue}", sheet)
    assert sheet.property_for("b", "color").order > sheet.property_for("a", "color").order
