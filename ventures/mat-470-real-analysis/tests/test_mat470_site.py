"""
Tests for MAT 470 Real Analysis interactive web companion site and engine.
"""

from pathlib import Path
import re

VENTURE_DIR = Path(__file__).resolve().parent.parent
SITE_DIR = VENTURE_DIR / "site"

def test_site_files_exist():
    assert (SITE_DIR / "index.html").exists()
    assert (SITE_DIR / "style.css").exists()
    assert (SITE_DIR / "app.js").exists()

def test_html_structure_and_accessibility():
    html_content = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    
    # Required HTML5 & SEO Elements
    assert "<!DOCTYPE html>" in html_content
    assert '<html lang="en">' in html_content
    assert "<title>MAT 470 — Real Analysis Interactive Proof & Study Companion</title>" in html_content
    assert '<meta name="description"' in html_content
    
    # Semantic Landmarks & ARIA Roles
    assert 'role="banner"' in html_content
    assert 'role="navigation"' in html_content
    assert 'role="main"' in html_content
    assert 'role="contentinfo"' in html_content
    
    # Navigation Tabs Present
    assert 'id="nav-epsilon"' in html_content
    assert 'id="nav-sequences"' in html_content
    assert 'id="nav-supremum"' in html_content
    assert 'id="nav-proofs"' in html_content
    assert 'id="nav-counterexamples"' in html_content
    assert 'id="nav-study"' in html_content
    assert 'id="nav-mastery"' in html_content
    assert 'id="mastery-section"' in html_content
    assert 'id="mastery-form"' in html_content

    # Canvas Elements
    assert 'id="epsilon-canvas"' in html_content
    assert 'id="sequence-canvas"' in html_content
    assert 'id="supremum-canvas"' in html_content
    assert 'id="pathological-canvas"' in html_content

def test_css_design_system_and_responsiveness():
    css_content = (SITE_DIR / "style.css").read_text(encoding="utf-8")
    
    # CSS Custom Properties / Design Tokens
    assert "--bg-primary:" in css_content
    assert "--accent-cyan:" in css_content
    assert "--glass-backdrop:" in css_content
    assert "--font-mono:" in css_content
    assert "highlight-nav-btn" in css_content
    assert "enrollment-form" in css_content
    
    # Responsive Media Queries
    assert "@media" in css_content
    assert "max-width:" in css_content

def test_js_app_engine_components():
    js_content = (SITE_DIR / "app.js").read_text(encoding="utf-8")
    
    # Core Feature Engines
    assert "drawEpsilonGraph" in js_content
    assert "drawSequencePlot" in js_content
    assert "drawSupremumPlot" in js_content
    assert "drawPathologicalPlot" in js_content
    assert "proofData" in js_content
    assert "quizQuestions" in js_content
    assert "switchTab" in js_content
    assert "mastery-form" in js_content
    # `mat470_mastery_leads` was asserted here too — the lead store appeared in
    # this file twice, so removing it from the deceptive test alone would have
    # left the suite still requiring it. Its absence is now asserted by
    # `test_the_form_neither_stores_nor_claims_to_send` below.

    # All Proof Theorems Included
    assert "irrational_sqrt2" in js_content
    assert "monotone_convergence" in js_content
    assert "squeeze_theorem" in js_content
    assert "extreme_value" in js_content

    # All Pathological Renderers Included
    assert "dirichlet" in js_content
    assert "thomae" in js_content
    assert "weierstrass" in js_content
    assert "cantor" in js_content

    # Quiz Coverage
    assert "Bolzano-Weierstrass" in js_content
    assert "Mean Value Theorem" in js_content
    assert "Uniform Limit Theorem" in js_content

# --- The claims control ------------------------------------------------------
#
# What stood here was `test_mastery_pass_concierge_tier`, and it asserted that
# the page contained "Mastery Pass ($14.99/mo)", "$9.99/mo", an email input and
# the button "Unlock Student Pass & Claim Discount ($9.99/mo)".
#
# Every one of those strings was part of a false representation. The venture is
# a static page: no server, no payment integration, no account system, nothing
# that can charge, cancel or refund. The page nonetheless carried a "Most
# Popular" badge, a "7-day money-back guarantee", perks stated as delivered that
# were never built, and a submit handler that wrote the visitor's address to
# localStorage and then told them to look in their inbox for an access key that
# does not exist and could never be sent.
#
# So the suite was pinning the deception in place: fixing the page would have
# turned this file red. Modelled on
# `ventures/quick-pick-survey/src/lib/pricingClaims.test.ts`, which forbids
# purchase copy while the venture has no payment path, the replacement asserts
# the refusal instead of the copy.

# Substrings that may not appear on the marketing surface while nothing can be
# bought. Each is assembled from parts rather than written out, because this
# control reads real source files and would otherwise match itself — the same
# reason the venture's own app.js paraphrases the banned sentence.
FORBIDDEN_WHILE_UNSELLABLE = {
    "refund promise": "money" + "-back guarantee",
    "cancellation promise": "Cancel " + "anytime",
    "social proof badge": "Most " + "Popular",
    "claimed delivery": "Check your " + "inbox",
    "purchase verb": "Unlock Student " + "Pass",
    "discount claim": "Claim " + "Discount",
    "locked-in price": "locked " + "in",
}

# A payment path means a real one. Derived from the venture's own files rather
# than a hand-set boolean, because a flag someone must remember to flip is how
# these controls go stale — see the repository's cap-ratchet enrollment work.
PAYMENT_MARKERS = ("stripe", "paypal", "checkout.session", "paymentintent", "<form action=")


def venture_has_payment_path() -> bool:
    """Can this venture actually take money today?

    True only if something in the site sources reaches a payment processor or
    posts a form somewhere. A price in the copy is not a payment path, which is
    the whole point of this control.
    """
    for path in sorted(SITE_DIR.rglob("*")):
        if not path.is_file() or path.suffix not in {".html", ".js", ".mjs", ".ts"}:
            continue
        haystack = path.read_text(encoding="utf-8").lower()
        if any(marker in haystack for marker in PAYMENT_MARKERS):
            return True
    return False


def test_the_control_is_reading_a_real_surface():
    """A guard against this whole file passing over nothing.

    If the site is ever restructured and these files move, every assertion below
    becomes vacuously true. This fails loudly instead.
    """
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    js = (SITE_DIR / "app.js").read_text(encoding="utf-8")
    assert len(html) > 5000, "index.html is too small to be the real marketing surface"
    assert "mastery-section" in html, "the tier section this control exists to police is missing"
    assert "mastery-form" in js, "the submit handler this control exists to police is missing"


def test_no_payment_path_exists_yet():
    """States the premise the assertions below depend on.

    If this ever fails, the venture has grown a way to take money and the
    forbidden list must be revisited deliberately — not deleted.
    """
    assert not venture_has_payment_path(), (
        "the site now reaches a payment processor; revisit FORBIDDEN_WHILE_UNSELLABLE "
        "deliberately rather than deleting it"
    )


def test_marketing_surface_promises_nothing_it_cannot_do():
    if venture_has_payment_path():
        return
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    js = (SITE_DIR / "app.js").read_text(encoding="utf-8")
    for label, needle in FORBIDDEN_WHILE_UNSELLABLE.items():
        assert needle not in html, f"index.html makes a {label} it cannot honour: {needle!r}"
        assert needle not in js, f"app.js makes a {label} it cannot honour: {needle!r}"


def test_the_price_is_disclosed_as_untested_rather_than_charged():
    """A price may be shown. It may not be shown as a price being charged."""
    html = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    if "$14.99" not in html:
        return
    assert "not for sale" in html.lower() or "will not be charged" in html.lower(), (
        "a price is displayed without saying plainly that nothing is charged"
    )


def test_the_form_neither_stores_nor_claims_to_send():
    """The two concrete defects, pinned individually.

    The handler must not persist a visitor's details, and must not assert a
    delivery it cannot observe.
    """
    js = (SITE_DIR / "app.js").read_text(encoding="utf-8")
    assert "mat470_mastery_leads" not in js, (
        "the lead store is back; it never left the browser, so it captured nothing "
        "while implying it had"
    )
    assert "discountClaimed" not in js, "the handler is recording a discount that does not exist"
