"""Every predictor-atlas entry traces to a committed source: the file exists, the row (or the
evidence record) exists, and the estimate and CI are the ones printed there. Also checks
race_coverage.json covers every lens bundle and the harmonized-schema columns are documented."""
import csv, gzip, json, unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
ATLAS = HERE / 'app' / 'data' / 'predictor_atlas.json'


def table(path):
    opener = gzip.open if path.suffix == '.gz' else open
    with opener(path, 'rt', newline='') as f:
        return list(csv.DictReader(f))


class PredictorAtlas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.atlas = json.loads(ATLAS.read_text())
        cls.cache = {}

    def rows(self, rel):
        if rel not in self.cache:
            self.cache[rel] = table(HERE / rel)
        return self.cache[rel]

    def test_every_entry_traces_to_its_source(self):
        ev = {r['id']: r for r in json.loads((HERE / 'reproducibility/literature_evidence/evidence.json').read_text())['records']}
        n = 0
        for e in self.atlas['entries']:
            src = e['source']
            self.assertTrue((HERE / src['file']).exists(), src)
            if 'record' in src:
                rec = ev[src['record']]
                self.assertTrue(rec['verified'], src)
                self.assertEqual(rec['provenance'], 'primary', src)
                self.assertAlmostEqual(float(rec['estimate']), e['estimate'], places=9)
            else:
                rows = self.rows(src['file'])
                self.assertGreaterEqual(src['row'], 1)
                row = rows[src['row'] - 1]
                self.assertAlmostEqual(float(row[src['column']]), e['estimate'], places=9, msg=str(src))
                lo, hi = e['ci95']
                self.assertLessEqual(lo, e['estimate'] + 1e-9, src)
                self.assertGreaterEqual(hi, e['estimate'] - 1e-9, src)
            n += 1
        self.assertGreater(n, 500)

    def test_schema_and_families(self):
        needed = {'id', 'family', 'predictor', 'contrast', 'measure', 'estimate', 'ci95', 'lens', 'population', 'adjusted',
                  'timing', 'source'}
        ids = set()
        for e in self.atlas['entries']:
            self.assertTrue(needed <= set(e), e.get('id'))
            self.assertNotIn(e['id'], ids)
            ids.add(e['id'])
        fams = set(self.atlas['families'])
        for f in ['education', 'race/ethnicity', 'family of origin', 'religion', 'occupation', 'economics and wealth',
                  'relationship history', 'age at marriage and age']:
            self.assertIn(f, fams)

    def test_race_coverage_covers_every_lens(self):
        cov = json.loads((HERE / 'app' / 'data' / 'race_coverage.json').read_text())
        manifest = json.loads((HERE / 'app' / 'models' / 'index.json').read_text())
        ids = [Path(m['file']).stem for m in manifest['lenses']]
        lenses = {l['lens'] for l in cov['lenses']}
        for b in ids:
            if b.endswith('_testvectors'):
                continue
            self.assertIn(b, lenses, b)
        forms = set(cov['form_categories'])
        for l in cov['lenses']:
            self.assertEqual(set(l['form_mapping']), forms, l['lens'])
            for v in l['form_mapping'].values():
                self.assertTrue(v is None or v in l['categories'], (l['lens'], v))
            if not l['categories']:
                self.assertTrue(all(v is None for v in l['form_mapping'].values()))


if __name__ == '__main__':
    unittest.main()
