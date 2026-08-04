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
    assert "mat470_mastery_leads" in js_content

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

def test_mastery_pass_concierge_tier():
    html_content = (SITE_DIR / "index.html").read_text(encoding="utf-8")
    assert "Mastery Pass ($14.99/mo)" in html_content
    assert "$9.99/mo" in html_content
    assert 'type="email"' in html_content
    assert "Unlock Student Pass & Claim Discount ($9.99/mo)" in html_content


