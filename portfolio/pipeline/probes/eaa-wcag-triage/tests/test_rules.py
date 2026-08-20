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
