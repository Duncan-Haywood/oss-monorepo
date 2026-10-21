from capture_storage import model
from capture_storage.sourced import PARAMS, sourced_set, use, hash_limited_readers


def test_use_restores_the_original_figures():
    before = (dict(model.CAMERAS), dict(model.CARDS), model.READER_MBS)
    with use(sourced_set(312.0)):
        assert model.READER_MBS == 312.0
        assert model.CARDS[512] == 0.25
    assert (model.CAMERAS, model.CARDS, model.READER_MBS) == before


def test_use_restores_after_an_error():
    try:
        with use(sourced_set(312.0)):
            raise RuntimeError
    except RuntimeError:
        pass
    assert model.READER_MBS == 90.0


def test_faster_reader_never_needs_more_readers():
    cams = ["360 camera", "action camera", "phone telephoto", "mirrorless body"]
    n = []
    for r in (90.0, 104.0, 312.0):
        with use(sourced_set(r)):
            n.append(model.offload(cams, 4, 7).readers)
    assert n == sorted(n, reverse=True)


def test_every_parameter_has_a_source_and_status():
    for v, unit, src, status in PARAMS.values():
        assert status in ("sourced", "assumed") and src and unit


def test_sourced_card_weights_are_the_sd_association_masses():
    assert PARAMS["card_g_micro"][0] == 0.25 and PARAMS["card_g_full"][0] == 2.0


def test_hash_feeds_readers():
    assert hash_limited_readers(1040.0, 104.0) == 10.0
