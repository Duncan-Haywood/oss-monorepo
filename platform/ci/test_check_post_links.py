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


def test_file_argument_checks_one_post(tmp_path, capsys):
    (tmp_path / 'ok.md').write_text('[a](ok.md)\n')
    (tmp_path / 'bad.md').write_text('[a](gone.md)\n')
    assert c.main(['x', str(tmp_path / 'ok.md')]) == 0
    assert c.main(['x', str(tmp_path / 'bad.md')]) == 1
    assert 'gone.md' in capsys.readouterr().out


def test_retired_app_host_is_flagged(tmp_path):
    """Red-team 2026-11-27: the close-out post's sign-up link pointed at payapps' workers.dev
    address, which provisioning turned off when the custom domain went live (404)."""
    (tmp_path / 'a.md').write_text(
        '[s](https://payapps.duncan-andrew-haywood.workers.dev/?signup&from=post) '
        '[ok](https://payapps.marisstella.app/?signup)\n')
    bad = c.broken(str(tmp_path))
    assert len(bad) == 1 and 'payapps.duncan-andrew-haywood.workers.dev' in bad[0][1]
