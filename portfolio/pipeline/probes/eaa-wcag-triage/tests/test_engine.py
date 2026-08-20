from wcag_triage.engine import audit_html


def test_blocking_sorted_before_degrading():
    html = (
        '<html lang="en">'  # ok
        "<h1>A</h1><h3>B</h3>"  # 2.4.6 degrading, early in document
        '<img src="x">'  # 1.1.1 blocking, later in document
        "</html>"
    )
    findings = audit_html(html).findings
    impacts = [f.impact for f in findings]
    # Despite the degrading finding appearing first in source, blocking sorts up.
    assert impacts[0] == "blocking"
    assert "degrading" in impacts


def test_counts():
    html = '<html lang="en"><title>t</title><img src="x"><img src="y"></html>'
    counts = audit_html(html).counts()
    assert counts == {"total": 2, "blocking": 2, "degrading": 0}


def test_duplicate_findings_deduped():
    # A focusable aria-hidden button could match two rules on one element;
    # it must be reported once.
    html = '<html lang="en"><title>t</title><button aria-hidden="true"></button></html>'
    findings = audit_html(html).findings
    keys = [f.key() for f in findings]
    assert len(keys) == len(set(keys))
