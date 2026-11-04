import check_heading_order as c


def test_skip_found():
    assert c.skips("<h1>a</h1><h2>b</h2><h4>c</h4>") == [(2, 4)]


def test_ok_and_ignored():
    assert c.skips("<h1>a</h1><h2>b</h2><h3>c</h3><h2>d</h2>") == []
    assert c.skips("<h1>a</h1><script>'<h4>'</script><!-- <h5> --><h2>b</h2>") == []
