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


# ---------------------------------------------------------------------------
# Rules added 2026-08-22, closing four of the eight rows
# `a11y-external-coverage-reference` disclosed as `unimplemented`.
# ---------------------------------------------------------------------------

PAGE = '<html lang="en"><head><title>t</title>{head}</head><body>{body}</body></html>'


def _page(head="", body="<p>x</p>"):
    return _criteria(PAGE.format(head=head, body=body))


# SC 2.2.1 — meta refresh

def test_meta_refresh_with_delay_is_flagged():
    assert "2.2.1" in _page(head='<meta http-equiv="refresh" content="5">')


def test_meta_refresh_with_url_and_delay_is_flagged():
    assert "2.2.1" in _page(head='<meta http-equiv="refresh" content="30;url=/next">')


def test_instant_redirect_is_not_a_time_limit():
    # content="0" never gives the reader a moment to be interrupted in.
    assert "2.2.1" not in _page(head='<meta http-equiv="refresh" content="0">')
    assert "2.2.1" not in _page(head='<meta http-equiv="refresh" content="0;url=/x">')


def test_unparseable_refresh_delay_says_nothing():
    assert "2.2.1" not in _page(head='<meta http-equiv="refresh" content="soon">')


def test_meta_refresh_is_blocking():
    findings = audit_html(PAGE.format(
        head='<meta http-equiv="refresh" content="5">', body="<p>x</p>")).findings
    assert [f.impact for f in findings if f.criterion == "2.2.1"] == ["blocking"]


# SC 2.2.2 — blink and marquee

def test_marquee_is_flagged():
    assert "2.2.2" in _page(body="<marquee>Sale!</marquee>")


def test_blink_is_flagged():
    assert "2.2.2" in _page(body="<blink>now</blink>")


def test_both_moving_elements_are_reported_separately():
    findings = audit_html(PAGE.format(
        head="", body="<marquee>a</marquee><blink>b</blink>")).findings
    assert len([f for f in findings if f.criterion == "2.2.2"]) == 2


def test_ordinary_page_has_no_moving_content_finding():
    assert "2.2.2" not in _page()


# SC 3.1.2 — language of parts

def test_invalid_lang_on_a_part_is_flagged():
    assert "3.1.2" in _page(body='<p lang="engl">bonjour</p>')


def test_valid_lang_on_a_part_is_not_flagged():
    assert "3.1.2" not in _page(body='<p lang="fr">bonjour</p>')


def test_lang_on_html_is_not_reported_as_a_part():
    # 3.1.2 is about parts; the root element's language is 3.1.1's business.
    assert "3.1.2" not in _page()


def test_empty_lang_on_a_part_is_not_flagged():
    assert "3.1.2" not in _page(body='<p lang="">bonjour</p>')


def test_invalid_lang_is_degrading_not_blocking():
    findings = audit_html(PAGE.format(
        head="", body='<p lang="engl">x</p>')).findings
    assert [f.impact for f in findings if f.criterion == "3.1.2"] == ["degrading"]


# SC 3.1.1 — the page's own lang, when present but not a language

def test_invalid_lang_on_html_is_flagged():
    html = '<html lang="engl"><head><title>t</title></head><body><p>x</p></body></html>'
    assert "3.1.1" in _criteria(html)


def test_malformed_lang_on_html_is_flagged():
    html = '<html lang="en_US"><head><title>t</title></head><body><p>x</p></body></html>'
    assert "3.1.1" in _criteria(html)


def test_valid_lang_on_html_still_passes():
    html = '<html lang="pt-BR"><head><title>t</title></head><body><p>x</p></body></html>'
    assert "3.1.1" not in _criteria(html)


def test_missing_html_lang_reports_once_not_twice():
    # rule_html_lang (absence) and rule_html_lang_valid (bad value) must not
    # both fire on the same element.
    findings = audit_html(
        "<html><head><title>t</title></head><body><p>x</p></body></html>").findings
    assert len([f for f in findings if f.criterion == "3.1.1"]) == 1


# SC 2.4.1 — bypass blocks

NAV = "<nav><a href='/a'>a</a><a href='/b'>b</a></nav>"
# Enough prose that the page has something to bypass *to*. Every "should fire"
# case below needs this: a navigation bar above an empty content region is a
# page that has not rendered, not a page failing 2.4.1.
CONTENT = "<div><p>" + ("Every survey you answer sharpens the next one. " * 6) + "</p></div>"


def test_nav_with_no_bypass_mechanism_is_flagged():
    assert "2.4.1" in _page(body=NAV + CONTENT)


def test_main_landmark_suppresses_it():
    assert "2.4.1" not in _page(body=NAV + "<main>" + CONTENT + "</main>")


def test_heading_suppresses_it():
    assert "2.4.1" not in _page(body=NAV + "<div><h1>T</h1>" + CONTENT + "</div>")


def test_skip_link_suppresses_it():
    assert "2.4.1" not in _page(
        body="<a href='#c'>Skip</a>" + NAV + "<div id='c'>" + CONTENT + "</div>")


def test_role_main_suppresses_it():
    assert "2.4.1" not in _page(body=NAV + "<div role='main'>" + CONTENT + "</div>")


def test_role_navigation_counts_as_a_block():
    assert "2.4.1" in _page(
        body="<div role='navigation'><a href='/a'>a</a></div>" + CONTENT)


def test_page_with_nothing_to_bypass_is_left_alone():
    # The gate: no nav, few links — there is no repeated block, so a missing
    # skip link is not a barrier.
    assert "2.4.1" not in _page(body=CONTENT)


def test_many_links_count_as_a_block_without_a_nav_element():
    links = "".join(f"<a href='/p{i}'>p{i}</a>" for i in range(12))
    assert "2.4.1" in _page(body=f"<div>{links}</div>" + CONTENT)


def test_link_count_below_the_threshold_does_not_trip_the_gate():
    links = "".join(f"<a href='/p{i}'>p{i}</a>" for i in range(5))
    assert "2.4.1" not in _page(body=f"<div>{links}</div>" + CONTENT)


def test_fragment_without_a_body_is_not_a_page():
    assert "2.4.1" not in _criteria(NAV + CONTENT)


def test_bypass_finding_is_blocking():
    findings = audit_html(PAGE.format(head="", body=NAV + CONTENT)).findings
    assert [f.impact for f in findings if f.criterion == "2.4.1"] == ["blocking"]


# The content gate, added after the first out-of-sample run produced exactly
# one finding and hand-checking showed it was a prerendered shell.

def test_unrendered_shell_is_not_a_bypass_failure():
    # The exact shape of `quick-pick-survey`'s /app prerender: a navigation
    # bar, and a content region holding a loading placeholder. The delivered
    # page has both a <main> and a heading; this file has neither.
    shell = '<div class="flex"><div>Loading&#8230;</div></div>' + NAV
    assert "2.4.1" not in _page(body=shell)


def test_navigation_text_does_not_count_as_content():
    # A page whose only text is its own navigation has nothing to skip to,
    # however many links the bar holds.
    links = "".join(f"<a href='/section-number-{i}'>Section number {i}</a>"
                    for i in range(14))
    assert "2.4.1" not in _page(body=f"<nav>{links}</nav><div></div>")


def test_script_text_does_not_count_as_content():
    # html.parser hands back the body of a <script> as character data. Counting
    # it would let a page of framework bootstrap look like a page of prose.
    payload = '<script>var x = "' + ("y" * 400) + '";</script>'
    assert "2.4.1" not in _page(body=NAV + f"<div>{payload}</div>")


def test_aria_hidden_text_does_not_count_as_content():
    hidden = '<div aria-hidden="true"><p>' + ("z " * 200) + "</p></div>"
    assert "2.4.1" not in _page(body=NAV + hidden)


# SC 1.4.1 — use of colour, implemented 2026-08-22

def test_link_with_no_underline_and_different_colour_is_flagged():
    body = (
        '<p style="color:#333">Read our '
        '<a href="/terms" style="color:#06c;text-decoration:none">terms</a>'
        " before continuing.</p>"
    )
    assert "1.4.1" in _page(body=body)


def test_link_with_no_decoration_declared_at_all_is_not_flagged():
    # No text-decoration declared: this is the ordinary case (a naked <a> is
    # underlined by every browser's UA stylesheet, so most real markup never
    # says so explicitly), and it is *not* positive evidence of a removed
    # underline -- decoration_line() reports it undecidable, and this rule
    # only fires on a decided "none".
    body = (
        '<p style="color:#333">Read our '
        '<a href="/terms" style="color:#06c">terms</a>'
        " before continuing.</p>"
    )
    assert "1.4.1" not in _page(body=body)


def test_same_colour_link_without_underline_is_flagged():
    """The worst case of the criterion, not a case outside it.

    This assertion was inverted until 2026-08-22, on the reasoning that a link
    identical to its prose is "not distinguished by colour either, so not this
    criterion's business". Measured against the reference engine, that reading
    is wrong in the direction that hides the most serious instance: axe-core's
    `link-in-text-block` fires below 3:1 and a ratio of 1.0 is as far below as
    it gets. A reader cannot see the link at all, and a record that says
    nothing about it has told the customer their page is fine.
    """
    body = (
        '<p style="color:#333">Read our '
        '<a href="/terms" style="color:#333;text-decoration:none">terms</a>'
        " before continuing, and see the shipping page for delivery times.</p>"
    )
    assert "1.4.1" in _page(body=body)


def test_standalone_link_with_no_surrounding_text_is_not_flagged():
    body = '<div style="color:#333"><a href="/terms" style="color:#06c;text-decoration:none">Terms</a></div>'
    assert "1.4.1" not in _page(body=body)


def test_inherited_decoration_is_resolved_not_declined():
    """`text-decoration: inherit` is a removed underline, not an unknown one.

    Also inverted on 2026-08-22, and this is the one that decides real pages:
    the declaration *overrides* the UA underline, so the value comes from the
    paragraph, which declares none. Treating it as undecidable is the same as
    treating it as underlined, and every Tailwind preflight writes exactly
    this rule — 152 in-prose links in this portfolio's own corpus, none of
    them underlined, all of them passing before the resolution was added.
    """
    body = (
        '<p style="color:#333">Read our '
        '<a href="/terms" style="color:#06c;text-decoration:inherit">terms</a>'
        " before continuing, and see the shipping page for delivery times.</p>"
    )
    assert "1.4.1" in _page(body=body)


def test_a_decoration_no_reader_can_resolve_is_still_declined():
    """The refusal survives where it is genuinely a refusal.

    A conditional decoration — declared only inside a media query this module
    cannot decide — yields nothing, which is the direction this probe commits
    to everywhere else.
    """
    css = (
        "<style>"
        ".t{color:#333}.l{color:#06c}"
        "@media (min-width: 40rem){.l{text-decoration:none}}"
        "</style>"
    )
    body = '<p class="t">Read our <a href="/terms" class="l">terms</a> before continuing today.</p>'
    assert "1.4.1" not in _criteria(PAGE.format(head=css, body=body))


def test_unresolvable_colour_is_undecidable_not_flagged():
    body = (
        '<p>Read our '
        '<a href="/terms" style="color:var(--link);text-decoration:none">terms</a>'
        " before continuing.</p>"
    )
    assert "1.4.1" not in _page(body=body)


def test_use_of_color_finding_is_blocking():
    body = (
        '<p style="color:#333">Read our '
        '<a href="/terms" style="color:#06c;text-decoration:none">terms</a>'
        " before continuing.</p>"
    )
    findings = audit_html(PAGE.format(head="", body=body)).findings
    assert [f.impact for f in findings if f.criterion == "1.4.1"] == ["blocking"]


def test_a_scheme_specific_failure_names_its_scheme():
    css = (
        "<style>"
        ".t{color:#333}"
        ".l{color:#333;text-decoration:none}"
        "@media (prefers-color-scheme: dark){.t{color:#eee}.l{color:#06c}}"
        "</style>"
    )
    body = ('<p class="t">Read our <a href="/terms" class="l">terms</a> today, '
            "and see the shipping page for delivery times.</p>")
    findings = audit_html(PAGE.format(head=css, body=body)).findings
    use_of_color = [f for f in findings if f.criterion == "1.4.1"]
    assert len(use_of_color) == 1
    # The scheme named is the one that *fails*. In this fixture that is light
    # mode, where link and prose are the same `#333`; in dark mode the prose
    # lifts to `#eee` and the link clears 3:1 against it, which passes. The
    # naming mechanism is the merged implementation's and is kept; which
    # scheme it names follows from the threshold, and the fixture's own
    # colours say light.
    assert "in light mode" in use_of_color[0].message
