import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_empty_controls as c


def test_flags_empty_link_and_button():
    html = '<a href="/x"></a><button> </button><a href="/y"><svg></svg></a>'
    assert [t for t, _ in c.empty_controls(html)] == ["a", "button", "a"]


def test_named_or_script_filled_is_fine():
    html = ('<a href="/x" aria-label="Home"></a><button title="Close"></button>'
            '<a href="/i"><img src="a.png" alt="Logo"></a><a name="top"></a>'
            '<button id="t"></button><script>t.textContent="Go"; document.getElementById("t")</script>'
            '<button>${label}</button>')
    assert c.empty_controls(html) == []
