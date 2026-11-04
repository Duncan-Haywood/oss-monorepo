import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import check_dom_ids as c


def test_duplicate_and_dangling():
    html = '<label for="a">x</label><input id="a"><p id="b"></p><p id="b"></p><div aria-labelledby="a zz"></div>'
    assert c.problems(html) == (["b"], ["zz"])


def test_ignores_data_for_scripts_comments_templates():
    html = ('<div data-for="regular"></div><script>x=\'<p id="q"></p><p id="q"></p>\'</script>'
            '<!-- <i id="c"></i><i id="c"></i> --><p id="${n}"></p><p id="${n}"></p>'
            '<label for="{{x}}"></label>')
    assert c.problems(html) == ([], [])
