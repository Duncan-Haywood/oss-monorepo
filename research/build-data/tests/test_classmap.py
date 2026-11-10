import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "src"))
import classmap as C  # noqa: E402


def test_structured_map_unchanged():
    # the session 10 map, which every committed transfer result used
    assert C.harmonise("PERMIT - NEW CONSTRUCTION") == "new_construction"
    assert C.harmonise("express permit program") == "other"
    assert C.harmonise("building") == "other"
    assert C.harmonise("otc alterations permit") == "alteration"


def test_description_whole_job_beats_trade_words():
    d = C.describe
    assert d("ERECT A 2 STORY SINGLE FAMILY RESIDENCE WITH ELECTRICAL AND PLUMBING") == "new_construction"
    assert d("Construct new single family residence per plan") == "new_construction"
    assert d("WRECK AND REMOVE 1 STORY FRAME GARAGE") == "demolition"
    assert d("Demolish existing house") == "demolition"
    assert d("Construct alterations to existing kitchen, including new electrical") == "alteration"
    assert d("interior alterations including electrical and plumbing") == "alteration"


def test_new_alone_is_not_new_construction_in_text():
    assert C.describe("install new water heater") == "plumbing"
    assert C.describe("Install new electrical service, 200 amp upgrade") == "electrical"
    assert C.describe("replace furnace with new heat pump") == "mechanical"
    assert C.describe("reroof, new shingles") == "alteration"


def test_description_misc_and_empty():
    assert C.describe("Install rooftop solar PV system") == "electrical"
    assert C.describe("install illuminated wall sign") == "sign"
    assert C.describe("fire alarm upgrade") == "fire"
    assert C.describe("") == "other" and C.describe(None) == "other"
    assert C.describe("design review") == "other"


def test_cascade_order():
    assert C.cascade("electric wiring", "remodel", "demolition") == "electrical"
    assert C.cascade("building", "residential", "new_construction") == "new_construction"
    assert C.cascade("building permit", "remodel", "plumbing") == "alteration"
    assert C.cascade("building", "", "") == "other"
    assert C.cascade("building", "", "bogus") == "other"
    for args in [("x",), ("x", "y", "sign"), ("demolition permit", "", "")]:
        assert C.cascade(*args) in C.CLASSES


def test_v1_rules_unchanged_by_v2():
    # session 70's pre-registered rules stay the default, so its predictions are scored on them
    assert C.describe("SOLAR PANEL PERMIT.  ERECT A PHOTOVOLTAIC ARRAY ON THE ROOF") == "new_construction"
    assert C.describe("Construct south two-family dwelling  per plan.") == "other"


def test_v2_fixes_the_dev_set_error_patterns():
    d = lambda s: C.describe(s, 2)
    assert d("SOLAR PANEL PERMIT.  ERECT A PHOTOVOLTAIC ARRAY ON THE ROOF") == "electrical"
    assert d("ERECT SIX (6) FOOT HIGH WOOD FENCE. 100 LINEAR FEET") == "alteration"
    assert d("ERECT TWO (2) SCAFFOLDS") == "other"
    assert d("ERECT 20'X 24' FRAME GARAGE (MAX 15' HEIGHT PER ZONING)") == "new_construction"
    assert d("Construct south two-family dwelling  per plan.") == "new_construction"
    assert d("Construct apartment building  occupy per plan") == "new_construction"
    assert d("Construct alterations to existing single family residence to convert into two family dwelling") == "alteration"
    assert d("**FIRE ALARM PERMIT**TENANT BUILD-OUT ON THE 7TH FLOOR") == "fire"
    assert d("CHANGE OF PLUMBING CONTRACTORS PERMIT #1 TO X PLUMBING INC.") == "other"
    assert d("INSTALL 200 AMP SERVICE") == "electrical"
    assert d("REPAIR SERVICE") == "electrical"
    assert d("Engineered voluntary seismic retrofit for SFR  subject to field inspection") == "alteration"
    assert d("REPLACE (1) ROOF TOP UNIT.") == "mechanical"
    assert d("TUCKPOINTING - NO STRUCTURAL WORK - 800 SQFT") == "alteration"
    assert d("INSTALLATION OF ONE(1) 2500LB CAPACITY PASSENGER ELEVATOR") == "other"


def test_v2_keeps_the_session_70_intent():
    d = lambda s: C.describe(s, 2)
    assert d("ERECT A 2 STORY SINGLE FAMILY RESIDENCE WITH ELECTRICAL AND PLUMBING") == "new_construction"
    assert d("Construct new single family residence per plan") == "new_construction"
    assert d("WRECK AND REMOVE 1 STORY FRAME GARAGE") == "demolition"
    assert d("install new water heater") == "plumbing"
    assert d("replace furnace with new heat pump") == "mechanical"
    assert d("install illuminated wall sign") == "sign"
    assert d("") == "other" and d("design review") == "other"
