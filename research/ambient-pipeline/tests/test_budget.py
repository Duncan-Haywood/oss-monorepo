import math

from ambient_pipeline.budget import (FRAME_MS, Stages, endpoint, first_sentence,
                                      required_speedup, wer)


def probs(pattern):
    """'1' = speech frame, '0' = silence frame."""
    return [0.9 if c == "1" else 0.05 for c in pattern]


def test_endpoint_single_segment():
    segs = endpoint(probs("000" + "1" * 10 + "0" * 20), hangover_ms=3 * FRAME_MS)
    assert len(segs) == 1
    s = segs[0]
    assert s["start_ms"] == 3 * FRAME_MS
    assert s["last_speech_ms"] == 13 * FRAME_MS
    assert s["detect_ms"] == 16 * FRAME_MS  # three quiet frames after speech


def test_short_pause_does_not_split_but_long_does():
    stream = "1" * 5 + "0" * 4 + "1" * 5 + "0" * 30
    assert len(endpoint(probs(stream), hangover_ms=10 * FRAME_MS)) == 1
    assert len(endpoint(probs(stream), hangover_ms=3 * FRAME_MS)) == 2


def test_open_segment_closed_at_end():
    segs = endpoint(probs("0" + "1" * 6), hangover_ms=500)
    assert len(segs) == 1 and segs[0]["last_speech_ms"] == 7 * FRAME_MS


def test_no_speech():
    assert endpoint(probs("0" * 50), 300) == []


def test_wer():
    assert wer("the cat sat", "The cat sat.") == 0.0
    assert wer("the cat sat", "the dog sat") == 1 / 3
    assert wer("a b", "") == 1.0
    assert math.isclose(wer("a b c d", "a x c d e"), 2 / 4)


def test_first_sentence():
    assert first_sentence("Hello there. More text") == "Hello there."
    assert first_sentence("No end yet") is None
    assert first_sentence("Pi is 3.14 roughly. Ok.") == "Pi is 3.14 roughly."


def test_latency_budget():
    s = Stages(500, 5, 300, 400, 100)
    assert s.reply_latency_ms() == 1305
    assert s.slack_ms(1000) == -305
    # compute 805 ms must fit in 500 ms of room: 1.61x
    assert math.isclose(required_speedup(s, 1000), 805 / 500)
    assert required_speedup(s, 400) == float("inf")
