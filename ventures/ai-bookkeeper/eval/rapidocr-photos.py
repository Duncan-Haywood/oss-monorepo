# Reads every photo in <photos> with RapidOCR the way `receipts FILE --rapidocr` does
# (rapidocr_rows.py: one reading, rows top to bottom) and writes <out>/<id>.txt, so
# eval/cord-receipts.mjs can score it. Shard with k n to use more cores:
#   python3 -m venv ro && ro/bin/pip install rapidocr-onnxruntime
#   for k in 1 2 3 4; do OMP_NUM_THREADS=1 ro/bin/python eval/rapidocr-photos.py <photos> <out> $k 4 & done; wait
#   node eval/cord-receipts.mjs eval/cord/train.jsonl --ocr <out>
# (eval/rapidocr-2026-11-17.md has the numbers.) Run it from the venture directory.
import os, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from rapidocr_rows import rows
from rapidocr_onnxruntime import RapidOCR

src, out = sys.argv[1], sys.argv[2]
k, n = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1, 1)
os.makedirs(out, exist_ok=True)
files = sorted(f for f in os.listdir(src) if f.lower().endswith((".jpg", ".jpeg", ".png")))[k - 1::n]
engine, t0 = RapidOCR(), time.time()
for f in files:
    dst = os.path.join(out, f.rsplit(".", 1)[0] + ".txt")
    if not os.path.exists(dst):
        with open(dst, "w") as fh:
            fh.write(rows(engine(os.path.join(src, f))[0]))
print(f"{k}/{n}: {len(files)} photos in {time.time() - t0:.0f} s")
