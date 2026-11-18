# Write CORD-v2's receipt photos out as files, named as eval/cord/*.jsonl names them
# (`<split>-<image_id>.<ext>`), so an OCR engine can read the photos the labels belong to.
# The images are Clova AI's (CC BY 4.0) and are not copied into this repository; fetch the
# parquet at run time (revision 7f0115a4, as eval/cord/README.md):
#   https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data/validation-00000-of-00001-cc3c5779fe22e8ca.parquet
#   https://huggingface.co/datasets/naver-clova-ix/cord-v2/resolve/7f0115a4/data/test-00000-of-00001-9c204eb3f4e11791.parquet
# Needs pyarrow (python3 -m venv v && v/bin/pip install pyarrow):
#   python3 eval/cord_images.py validation-....parquet validation <out_dir>
import json, os, sys
import pyarrow.parquet as pq
src, split, out = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(out, exist_ok=True)
t = pq.read_table(src, columns=["image", "ground_truth"]).to_pylist()
for row in t:
    g = json.loads(row["ground_truth"])
    b = row["image"]["bytes"]
    ext = "png" if b[:8] == b"\x89PNG\r\n\x1a\n" else "jpg"
    with open(os.path.join(out, f"{split}-{g['meta']['image_id']}.{ext}"), "wb") as f:
        f.write(b)
print(f"{len(t)} photos written to {out}")
