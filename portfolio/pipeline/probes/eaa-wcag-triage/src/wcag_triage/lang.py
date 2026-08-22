"""Whether a ``lang`` attribute holds a language tag at all.

Split out of :mod:`wcag_triage.rules` because two criteria need it and they
need it for different reasons: 3.1.1 asks whether the *page's* declared
language is real, 3.1.2 asks the same of every *part* that declares its own.

The check has two layers, and the second one is the reason this is not a
one-line regex.

**Syntax** is decided against RFC 5646's ``langtag`` production. That alone is
not enough, and the case that proves it is the one an external reference
flagged and a pure-syntax check does not: ``lang="engl"``. Four alpha
characters is a *well-formed* primary subtag — RFC 5646 reserves 4-character
subtags for future use — so a grammar check calls it valid. It is not a
language.

**Registry**, therefore, for the primary subtag, and this is where the rule
stays deliberately incomplete rather than guessing:

- **Two letters** are checked against the ISO 639-1 list below (184 codes plus
  5 deprecated aliases still found in real markup). The list is closed and
  small, so a two-letter subtag outside it is decidably not a language.
- **Three letters** are *accepted without checking*. ISO 639-2/3 runs to some
  7,000 codes; embedding them to catch a rare typo would trade a large data
  file for a small gain, and a checker that guesses is worse than one that
  says what it skipped. Recorded here as a known under-report.
- **Four to eight letters** are rejected. The range is syntactically legal and
  holds no registered language — ``engl``, ``english``, ``deutsch`` all land
  here, and they are the realistic authoring mistake.

Every layer errs the same way: a tag this module cannot decide is called
valid, so the rules built on it under-report rather than cry wolf. That is the
same direction :mod:`wcag_triage.rules` commits to in its own docstring.
"""

from __future__ import annotations

import re

# ISO 639-1, the closed two-letter set.
_ISO_639_1 = frozenset("""
aa ab ae af ak am an ar as av ay az ba be bg bh bi bm bn bo br bs ca ce ch co
cr cs cu cv cy da de dv dz ee el en eo es et eu fa ff fi fj fo fr fy ga gd gl
gn gu gv ha he hi ho hr ht hu hy hz ia id ie ig ii ik io is it iu ja jv ka kg
ki kj kk kl km kn ko kr ks ku kv kw ky la lb lg li ln lo lt lu lv mg mh mi mk
ml mn mr ms mt my na nb nd ne ng nl nn no nr nv ny oc oj om or os pa pi pl ps
pt qu rm rn ro ru rw sa sc sd se sg si sk sl sm sn so sq sr ss st su sv sw ta
te tg th ti tk tl tn to tr ts tt tw ty ug uk ur uz ve vi vo wa wo xh yi yo za
zh zu
""".split())

# Deprecated ISO 639-1 codes that still appear in real markup. Accepted so the
# rule does not fire on a page that is merely old.
_DEPRECATED = frozenset({"in", "iw", "ji", "jw", "mo"})

_VALID_TWO_LETTER = _ISO_639_1 | _DEPRECATED

# RFC 5646 langtag, plus the private-use and grandfathered forms that stand
# alone. Case-insensitive: BCP 47 tags are not case-sensitive, though the
# conventional casing is lowercase-language, Titlecase-Script, UPPERCASE-REGION.
_LANGTAG = re.compile(
    r"""^
    (?:
        # privateuse: x-whatever
        x(?:-[a-z0-9]{1,8})+
      |
        # irregular grandfathered tags still registered in BCP 47
        i-(?:ami|bnn|default|enochian|hak|klingon|lux|mingo|navajo|pwn|tao|tay|tsu)
      |
        # langtag
        (?P<language>[a-z]{2,8})
        (?:-[a-z]{3}){0,3}                          # extlang
        (?:-[a-z]{4})?                              # script
        (?:-(?:[a-z]{2}|[0-9]{3}))?                 # region
        (?:-(?:[a-z0-9]{5,8}|[0-9][a-z0-9]{3}))*    # variant
        (?:-[a-wy-z0-9](?:-[a-z0-9]{2,8})+)*        # extension
        (?:-x(?:-[a-z0-9]{1,8})+)?                  # private use
    )
    $""",
    re.VERBOSE | re.IGNORECASE,
)

MALFORMED = "malformed"
UNKNOWN_LANGUAGE = "unknown-language"


def check(value: str):
    """Return ``None`` if ``value`` is a usable language tag, else a reason.

    The reason is one of :data:`MALFORMED` (not a BCP 47 tag at all) or
    :data:`UNKNOWN_LANGUAGE` (well-formed, but the primary subtag names no
    language). Callers turn that into a message; this module does not know
    which criterion is asking.
    """
    tag = (value or "").strip()
    if not tag:
        # `lang=""` is legal HTML and means "language unknown" — an explicit
        # statement, not an error. Nothing to report.
        return None
    match = _LANGTAG.match(tag)
    if match is None:
        return MALFORMED
    language = match.group("language")
    if language is None:
        # A private-use or grandfathered tag: well-formed by construction and
        # carrying no ISO primary subtag to look up.
        return None
    language = language.lower()
    if len(language) == 2:
        return None if language in _VALID_TWO_LETTER else UNKNOWN_LANGUAGE
    if len(language) == 3:
        # ISO 639-2/3 — deliberately unchecked, see the module docstring.
        return None
    # 4-8 alpha: syntactically reserved, no registered language lives here.
    return UNKNOWN_LANGUAGE
