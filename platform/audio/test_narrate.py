"""Tests for the narration engine's text, timing and cache logic. No model needed:
the voice is stood in for by audio written into the cache first."""
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import narrate as N  # noqa: E402


class Sentences(unittest.TestCase):
    def test_splits_at_sentence_ends(self):
        text = "The first sentence is long enough to stand alone here. The second one is long enough as well, surely."
        self.assertEqual(N.sentences(text), ["The first sentence is long enough to stand alone here.",
                                             "The second one is long enough as well, surely."])

    def test_merges_short_sentences(self):
        self.assertEqual(N.sentences("No. It was never going to work, not with the storage blocked."),
                         ["No. It was never going to work, not with the storage blocked."])

    def test_keeps_abbreviations_and_acronyms_whole(self):
        units = N.sentences("We asked Dr. Okafor about it at length, over coffee. The A.I. Agent said nothing useful at all today.")
        self.assertEqual(len(units), 2)
        self.assertTrue(units[0].startswith("We asked Dr. Okafor"))
        self.assertTrue(units[1].startswith("The A.I. Agent"))

    def test_quotes_stay_with_their_sentence(self):
        units = N.sentences('She said, "the lamp is lit and the door is open tonight." Then she went inside and closed it.')
        self.assertTrue(units[0].endswith('tonight."'))

    def test_whitespace_and_empty(self):
        self.assertEqual(N.sentences("  \n "), [])
        self.assertEqual(N.sentences("one\nline"), ["one line"])


class Timing(unittest.TestCase):
    def test_pause_follows_punctuation(self):
        self.assertGreater(N.pause_after("Why?"), N.pause_after("Yes."))
        self.assertGreater(N.pause_after("Yes."), N.pause_after("and so,"))
        self.assertAlmostEqual(N.pause_after('"Done."'), N.PAUSE_AFTER["."])
        self.assertAlmostEqual(N.pause_after("Yes.", speed=0.5), 2 * N.PAUSE_AFTER["."])

    def test_fade_zeroes_the_edges_only(self):
        a = N.fade(np.ones(N.RATE, dtype=np.float32))
        self.assertAlmostEqual(float(a[0]), 0.0)
        self.assertAlmostEqual(float(a[-1]), 0.0)
        self.assertEqual(float(a[N.RATE // 2]), 1.0)
        self.assertEqual(len(N.fade(np.ones(3, dtype=np.float32))), 3)

    def test_respell(self):
        self.assertEqual(N.respell("the AI and the CI", [(r"\bAI\b", "A.I.")]), "the A.I. and the CI")
        self.assertEqual(N.respell("AIR and AI ~3", {"AI": "A I", "~": "about "}), "AIR and A I about 3")


class Render(unittest.TestCase):
    def setUp(self):
        self.dir = Path(tempfile.mkdtemp())
        self.n = N.Narrator(voice="af_heart", models=self.dir / "models", cache=self.dir / "cache", g2p="espeak")

    def tearDown(self):
        shutil.rmtree(self.dir)

    def prime(self, text, seconds):
        audio = np.full(int(seconds * N.RATE), 0.25, dtype=np.float32)
        self.n._store(self.n._key(text), audio)
        return audio

    def test_renders_from_cache_with_designed_gaps(self):
        a = "The first sentence is long enough to stand alone here."
        b = "The second one is long enough as well, surely?"
        self.prime(a, 1.0)
        self.prime(b, 0.5)
        bell = np.full(N.RATE // 10, 0.5, dtype=np.float32)
        out = self.n.render([N.Clip(bell), N.Gap(0.2), N.Say(f"{a} {b}", after=0.6)])
        expect = 0.1 + 0.2 + 1.0 + N.pause_after(a) + 0.5 + 0.6
        self.assertAlmostEqual(len(out) / N.RATE, expect, places=3)
        self.assertEqual(self.n.stats, {"units": 2, "voiced": 0, "cached": 2})
        self.assertAlmostEqual(float(out[0]), 0.0)  # the clip got its fade

    def test_repeated_text_is_voiced_once(self):
        a = "A line that a story repeats, like a refrain sung twice."
        self.prime(a, 0.3)
        self.n.render([N.Say(a, after=0.1), N.Say(a)])
        self.assertEqual(self.n.stats["cached"], 1)

    def test_key_depends_on_voice_speed_and_g2p(self):
        k = self.n._key("x")
        self.assertNotEqual(k, N.Narrator(voice="bm_george", models=self.n.models, g2p="espeak")._key("x"))
        self.assertNotEqual(k, N.Narrator(speed=0.9, models=self.n.models, g2p="espeak")._key("x"))
        self.assertNotEqual(k, N.Narrator(models=self.n.models, g2p="misaki")._key("x"))
        self.assertEqual(k, N.Narrator(models=self.n.models, g2p="espeak")._key("x"))

    def test_cache_round_trip_is_close(self):
        audio = np.sin(np.linspace(0, 100, 4800)).astype(np.float32) * 0.8
        self.n._store("ab" * 32, audio)
        self.assertLess(float(np.max(np.abs(self.n._cached("ab" * 32) - audio))), 1e-3)


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "needs ffmpeg")
class Master(unittest.TestCase):
    def test_lands_on_target_loudness(self):
        t = np.arange(N.RATE * 12) / N.RATE
        # A quiet, speech-like test signal: a 180 Hz buzz with syllable-rate bursts.
        pcm = (0.02 * np.sign(np.sin(2 * np.pi * 180 * t)) * (np.sin(2 * np.pi * 3 * t) > 0)).astype(np.float32)
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "x.mp3"
            entry = N.master(pcm, out, metadata={"title": "test"})
            self.assertAlmostEqual(entry["seconds"], 12.0, delta=0.15)
            self.assertEqual(entry["bytes"], out.stat().st_size)
            import subprocess
            raw = subprocess.run(["ffmpeg", "-v", "error", "-i", str(out), "-f", "f32le", "-ac", "1", "-ar", str(N.RATE), "-"],
                                 capture_output=True, check=True).stdout
            m = N.measure(np.frombuffer(raw, "<f4"), pre="")
            self.assertAlmostEqual(m["lufs"], N.LOUDNESS, delta=1.0)
            self.assertLess(m["peak"], -0.5)


if __name__ == "__main__":
    unittest.main()
