"""Milestone 7zze: keep main.tex readable. Section III-B had grown one 1,611-word paragraph
(one sentence per sub-step, 7zr to 7zzd); this pins the split so it does not regrow."""
import os
import re
import unittest

MAIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "paper", "main.tex")
LIMIT = 400  # words per paragraph, TeX commands stripped; the longest after 7zze is about 300


def paragraph_words(tex):
    body = tex.split("\\begin{document}", 1)[1]
    out = []
    for para in re.split(r"\n\s*\n", body):
        text = "\n".join(l for l in para.split("\n") if not l.lstrip().startswith("%"))
        out.append((len(re.sub(r"\\[a-zA-Z]+|[{}$\\]", " ", text).split()), text[:60]))
    return out


class ParagraphTests(unittest.TestCase):
    def test_no_paragraph_over_limit(self):
        with open(MAIN) as f:
            long = [(n, head) for n, head in paragraph_words(f.read()) if n > LIMIT]
        self.assertEqual(long, [])

    def test_counter_sees_a_long_paragraph(self):
        tex = "\\begin{document}\n" + "word " * (LIMIT + 1) + "\n\nshort one\n"
        self.assertEqual([n for n, _ in paragraph_words(tex)], [LIMIT + 1, 2])

    def test_lb10_reading_names_both_families(self):
        with open(MAIN) as f:
            tex = f.read()
        self.assertIn("the $L/B$ 10 shortfall is common to both", tex)
        self.assertNotIn("is therefore a property of the added-resistance formula's speed treatment", tex)


if __name__ == "__main__":
    unittest.main()
