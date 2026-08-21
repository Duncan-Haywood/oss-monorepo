from wcag_triage.engine import audit_html


def _criteria(html):
    return sorted(f.criterion for f in audit_html(html).findings)


def test_img_without_alt_is_flagged():
    assert "1.1.1" in _criteria('<html lang="en"><title>t</title><img src="x"></html>')


def test_decorative_empty_alt_is_not_flagged():
    assert "1.1.1" not in _criteria('<html lang="en"><title>t</title><img src="x" alt=""></html>')


def test_missing_lang_flagged():
    assert "3.1.1" in _criteria("<html><title>t</title></html>")


def test_present_lang_not_flagged():
    assert "3.1.1" not in _criteria('<html lang="fr"><title>t</title></html>')


def test_missing_title_is_degrading():
    findings = audit_html('<html lang="en"></html>').findings
    title = [f for f in findings if f.criterion == "2.4.2"]
    assert title and title[0].impact == "degrading"


def test_unlabelled_input_flagged():
    html = '<html lang="en"><title>t</title><input type="text" name="q"></html>'
    assert "1.3.1" in _criteria(html)


def test_input_labelled_by_for_not_flagged():
    html = '<html lang="en"><title>t</title><label for="q">Q</label><input id="q"></html>'
    assert "1.3.1" not in _criteria(html)


def test_input_wrapped_in_label_not_flagged():
    html = '<html lang="en"><title>t</title><label>Q <input type="text"></label></html>'
    assert "1.3.1" not in _criteria(html)


def test_submit_and_hidden_inputs_not_flagged_for_name():
    html = (
        '<html lang="en"><title>t</title>'
        '<input type="submit" value="Go">'
        '<input type="hidden" name="csrf"></html>'
    )
    assert "1.3.1" not in _criteria(html)


def test_empty_link_flagged():
    html = '<html lang="en"><title>t</title><a href="/x"></a></html>'
    assert "2.4.4" in _criteria(html)


def test_link_with_aria_label_not_flagged():
    html = '<html lang="en"><title>t</title><a href="/x" aria-label="Cart"></a></html>'
    assert "2.4.4" not in _criteria(html)


def test_link_with_image_alt_not_flagged():
    html = '<html lang="en"><title>t</title><a href="/"><img src="l" alt="Home"></a></html>'
    assert "2.4.4" not in _criteria(html)


def test_empty_button_flagged():
    html = '<html lang="en"><title>t</title><button><span></span></button></html>'
    assert "4.1.2" in _criteria(html)


def test_focusable_aria_hidden_flagged():
    html = '<html lang="en"><title>t</title><input type="text" aria-label="x" aria-hidden="true"></html>'
    findings = audit_html(html).findings
    assert any(f.criterion == "4.1.2" and f.impact == "blocking" for f in findings)


def test_video_without_captions_flagged():
    html = '<html lang="en"><title>t</title><video src="v.mp4"></video></html>'
    assert "1.2.2" in _criteria(html)


def test_video_with_captions_not_flagged():
    html = '<html lang="en"><title>t</title><video src="v.mp4"><track kind="captions" src="c"></video></html>'
    assert "1.2.2" not in _criteria(html)


def test_skipped_heading_level_is_degrading():
    html = '<html lang="en"><title>t</title><h1>A</h1><h3>B</h3></html>'
    findings = [f for f in audit_html(html).findings if f.criterion == "2.4.6"]
    assert findings and findings[0].impact == "degrading"


def test_sequential_headings_not_flagged():
    html = '<html lang="en"><title>t</title><h1>A</h1><h2>B</h2><h3>C</h3></html>'
    assert "2.4.6" not in _criteria(html)


def test_data_table_without_headers_flagged():
    html = (
        '<html lang="en"><title>t</title><table>'
        "<tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr>"
        "</table></html>"
    )
    assert "1.3.1" in _criteria(html)


def test_presentation_table_not_flagged():
    html = (
        '<html lang="en"><title>t</title><table role="presentation">'
        "<tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr>"
        "</table></html>"
    )
    assert "1.3.1" not in _criteria(html)


def test_fully_accessible_page_has_no_findings():
    html = (
        '<html lang="de"><title>Shop</title>'
        '<a href="/"><img src="l" alt="Home"></a>'
        '<label for="q">Search</label><input id="q" type="text">'
        "<button type=\"submit\">Go</button>"
        "<h1>Shop</h1><h2>Featured</h2></html>"
    )
    assert audit_html(html).findings == []


# ---------------------------------------------------------------------------
# 1.4.2 and 1.4.4, added 2026-08-21. Both were checked by the sibling engine
# (portfolio/research/a11y-evidence-record/audit.py) and by this one neither
# checked nor declared manual, so the coverage statement was silent about
# them. See portfolio/research/a11y-engine-agreement/.
# ---------------------------------------------------------------------------

_OK = '<html lang="en"><title>t</title>'


def test_autoplay_without_muted_flagged():
    assert "1.4.2" in _criteria(_OK + '<video autoplay src="x.mp4">'
                                      '<track kind="captions" src="c.vtt"></video></html>')


def test_muted_autoplay_not_flagged():
    assert "1.4.2" not in _criteria(_OK + '<video autoplay muted src="x.mp4">'
                                          '<track kind="captions" src="c.vtt"></video></html>')


def test_autoplay_audio_flagged():
    assert "1.4.2" in _criteria(_OK + '<audio autoplay src="x.mp3"></audio></html>')


def test_viewport_user_scalable_no_flagged():
    assert "1.4.4" in _criteria(
        _OK + '<meta name="viewport" content="width=device-width, user-scalable=no"></html>')


def test_viewport_maximum_scale_below_two_flagged():
    assert "1.4.4" in _criteria(
        _OK + '<meta name="viewport" content="width=device-width, maximum-scale=1.0"></html>')


def test_ordinary_viewport_not_flagged():
    assert "1.4.4" not in _criteria(
        _OK + '<meta name="viewport" content="width=device-width, initial-scale=1"></html>')


def test_maximum_scale_of_five_not_flagged():
    assert "1.4.4" not in _criteria(
        _OK + '<meta name="viewport" content="width=device-width, maximum-scale=5"></html>')


# --- focusability refinement to the 4.1.2 aria-hidden rule -----------------

def test_aria_hidden_control_out_of_the_tab_order_not_flagged():
    # tabindex="-1", `hidden`, and an anchor with no href all remove the
    # element from the tab order, which makes aria-hidden legitimate.
    for markup in (
        '<button aria-hidden="true" tabindex="-1">Go</button>',
        '<button aria-hidden="true" hidden>Go</button>',
        '<a aria-hidden="true">x</a>',
        '<input type="hidden" aria-hidden="true">',
    ):
        assert "4.1.2" not in _criteria(_OK + markup + "</html>"), markup


def test_aria_hidden_focusable_control_still_flagged():
    assert "4.1.2" in _criteria(
        _OK + '<input type="text" aria-label="q" aria-hidden="true"></html>')


# ---------------------------------------------------------------------------
# Frames, added 2026-08-21. `audit.py` has flagged an untitled <iframe> since
# it was written; this engine had no iframe rule at all, and no corpus it had
# ever been run on contained a frame — not the fixtures, not the storefront
# tarballs, not the 118 built pages of portfolio/research/a11y-own-sites/.
# The gap surfaced on the first corpus that did: the map embedded on every
# page local-site-studio delivers. See portfolio/research/a11y-generated-sites/.
# ---------------------------------------------------------------------------

def test_untitled_iframe_flagged():
    assert "4.1.2" in _criteria(_OK + '<iframe src="m.html"></iframe></html>')


def test_untitled_iframe_is_blocking():
    findings = audit_html(_OK + '<iframe src="m.html"></iframe></html>').findings
    frames = [f for f in findings if f.element == "iframe"]
    assert frames and frames[0].impact == "blocking"


def test_titled_iframe_not_flagged():
    assert "4.1.2" not in _criteria(
        _OK + '<iframe src="m.html" title="Map of the shop"></iframe></html>')


def test_iframe_named_by_aria_label_not_flagged():
    assert "4.1.2" not in _criteria(
        _OK + '<iframe src="m.html" aria-label="Map of the shop"></iframe></html>')


def test_iframe_with_whitespace_only_title_flagged():
    """A title of spaces is not a name, and is easy to emit from a template."""
    assert "4.1.2" in _criteria(_OK + '<iframe src="m.html" title="  "></iframe></html>')


def test_aria_hidden_iframe_not_flagged():
    """A frame removed from the accessibility tree owes no name.

    Matches how every other name rule here treats aria-hidden, and matches
    `audit.py`'s own `hidden` guard on the same rule.
    """
    assert "4.1.2" not in _criteria(
        _OK + '<iframe src="m.html" aria-hidden="true"></iframe></html>')


def test_iframe_text_content_is_not_a_name():
    """Fallback content inside a frame is not its accessible name.

    A button falls back to its text; a frame does not, because the text is
    what shows when the frame cannot load, not what names it when it can.
    """
    assert "4.1.2" in _criteria(
        _OK + '<iframe src="m.html">Map of the shop</iframe></html>')


# --- the invariant that would have caught the gap --------------------------

def test_coverage_catalog_accounts_for_every_statically_reachable_criterion():
    """A criterion in neither the checked nor the manual list is silent.

    A reader of the record can only tell "checked and passed" from "never
    looked at" via the coverage catalog, so every criterion this pass can
    reach from static markup must appear in it.
    """
    from wcag_triage.rules import COVERAGE

    listed = {c.criterion for c in COVERAGE}
    statically_reachable = {
        "1.1.1", "1.2.2", "1.3.1", "1.4.2", "1.4.4",
        "2.4.2", "2.4.4", "2.4.6", "3.1.1", "4.1.2",
    }
    assert statically_reachable - listed == set()


def test_every_criterion_a_rule_can_emit_is_declared_non_manual():
    """A rule that fires on a criterion the catalog calls "manual" would make
    the coverage statement a lie in the other direction."""
    from wcag_triage.rules import COVERAGE

    manual = {c.criterion for c in COVERAGE if c.coverage == "manual"}
    emitted = set(_criteria(
        _OK
        + '<img src="x">'
        + '<video src="v.mp4"></video>'
        + '<video autoplay src="w.mp4"><track kind="captions" src="c.vtt"></video>'
        + '<meta name="viewport" content="user-scalable=no">'
        + '<a href="/x"></a><button></button>'
        + '<input type="text" aria-hidden="true" aria-label="q">'
        + "<h1>A</h1><h3>B</h3>"
        + "<table><tr><td>a</td></tr><tr><td>b</td></tr></table>"
        + "</html>"
    ))
    assert emitted & manual == set()
