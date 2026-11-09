import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(__file__))
import check_post_links as c


def test_detects_missing_and_ignores_code_and_encoding():
    with tempfile.TemporaryDirectory() as d:
        os.makedirs(os.path.join(d, 'a b'))
        open(os.path.join(d, 'a b', 'x.md'), 'w').close()
        open(os.path.join(d, 'p.md'), 'w').write(
            '[ok](a%20b/x.md#h) `[no](nope.md)` [bad](gone.svg)\n```\n[c](zz.md)\n```\n[w](https://e.com)')
        got = c.broken(d)
        assert [u for _, u in got] == ['gone.svg']


def test_wrong_venture_mount_is_flagged(tmp_path):
    import check_post_links as c
    (tmp_path / 'a.md').write_text('[x](https://marisstella.app/ventures/foo/a.html) [y](https://marisstella.app/foo/a.html)\n')
    bad = c.broken(str(tmp_path))
    assert len(bad) == 1 and '/ventures/foo' in bad[0][1]
