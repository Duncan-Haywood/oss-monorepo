"""`wcag_triage.lang` — what counts as a language tag, and what is left alone.

The cases that matter here are the ones where syntax and registry disagree.
`engl` is well-formed BCP 47 and is not a language; `qq` is well-formed and is
not a language; `zh-Hans-CN` looks exotic and is fine. A pure grammar check
gets the first two wrong, which is exactly why this module has two layers.
"""

from wcag_triage import lang


def test_plain_two_letter_codes_pass():
    for tag in ("en", "fr", "de", "pt", "zh", "ar", "he"):
        assert lang.check(tag) is None, tag


def test_region_script_and_variant_subtags_pass():
    for tag in ("en-US", "pt-BR", "zh-Hans", "zh-Hans-CN", "de-DE-1901",
                "es-419", "en-GB-oxendict", "en-US-u-va-posix"):
        assert lang.check(tag) is None, tag


def test_case_is_not_significant():
    for tag in ("EN", "en-us", "ZH-hans-cn"):
        assert lang.check(tag) is None, tag


def test_empty_lang_is_an_explicit_statement_not_an_error():
    # `lang=""` legally means "language unknown". Reporting it would be
    # reporting the author for saying so.
    assert lang.check("") is None
    assert lang.check("   ") is None


def test_underscore_is_malformed():
    # The single most common way to write a language tag wrongly: copying a
    # POSIX locale straight into the attribute.
    assert lang.check("en_US") == lang.MALFORMED


def test_obvious_non_tags_are_malformed():
    for tag in ("en US", "e", "!!", "en-", "-en", "english (uk)"):
        assert lang.check(tag) == lang.MALFORMED, tag


def test_four_letter_subtag_is_well_formed_but_not_a_language():
    # The case that forces the registry layer to exist: RFC 5646 reserves
    # 4-character primary subtags, so a grammar check calls `engl` valid.
    assert lang.check("engl") == lang.UNKNOWN_LANGUAGE


def test_spelled_out_language_names_are_rejected():
    for tag in ("english", "deutsch", "francais"):
        assert lang.check(tag) == lang.UNKNOWN_LANGUAGE, tag


def test_unassigned_two_letter_codes_are_rejected():
    for tag in ("qq", "xq", "zz"):
        assert lang.check(tag) == lang.UNKNOWN_LANGUAGE, tag


def test_deprecated_iso_codes_are_accepted():
    # Old markup, not broken markup.
    for tag in ("iw", "in", "ji", "jw", "mo"):
        assert lang.check(tag) is None, tag


def test_three_letter_subtags_are_accepted_unchecked():
    # Documented under-report: ISO 639-2/3 is not embedded, so a three-letter
    # typo passes. Pinned so the limitation is visible rather than assumed.
    assert lang.check("haw") is None
    assert lang.check("zzz") is None


def test_private_use_and_grandfathered_tags_pass():
    assert lang.check("x-klingon") is None
    assert lang.check("i-navajo") is None
