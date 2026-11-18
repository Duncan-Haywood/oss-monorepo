# A second reading of a receipt photo built on RapidOCR's layout: RapidOCR finds the text rows
# (rapidocr_rows.py's grouping), and tesseract reads each row's crop as one line (`--psm 7`,
# `-l rus+eng` by default), so the words come out in Cyrillic where RapidOCR's default model
# prints Latin look-alikes. Writes <out>/<id>.txt for eval/cord-receipts.mjs. Tried on
# cdek-ocr/receipt-ocr-ru's val split (eval/receipt-ocr-ru-rus-vote-2026-11-18.md): it finds the
# ИТОГ word on more slips than tesseract's own page layout, but its digits are no better, and
# it added no total to RapidOCR's reading in a vote. Kept for reproduction, not used by the CLI.
#   python3 -m venv v && v/bin/pip install rapidocr-onnxruntime pillow   (and apt tesseract-ocr-rus)
#   OMP_NUM_THREADS=1 v/bin/python eval/rowcrop-tesseract.py <photos> <out> [k n]
import io, os, subprocess, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

def line_boxes(results):
    boxes = []
    for box, text, _ in results or []:
        ys = [p[1] for p in box]; xs = [p[0] for p in box]
        boxes.append((min(ys), max(ys), min(xs), max(xs), text))
    boxes.sort(key=lambda b: (b[0] + b[1]) / 2)
    lines = []
    for b in boxes:
        c = (b[0] + b[1]) / 2
        for l in lines:
            if l["top"] <= c <= l["bottom"]:
                l["items"].append(b); break
        else:
            lines.append({"top": b[0], "bottom": b[1], "items": [b]})
    lines.sort(key=lambda l: l["top"])
    return lines

def tess(img, lang):
    buf = io.BytesIO(); img.save(buf, "PNG")
    r = subprocess.run(["tesseract", "stdin", "stdout", "-l", lang, "--psm", "7"], input=buf.getvalue(), capture_output=True, timeout=30, env={**os.environ, "OMP_THREAD_LIMIT": "1"})
    return r.stdout.decode("utf-8", "replace").strip()

def read(photo, engine, lang="rus+eng"):
    im = Image.open(photo).convert("L")
    res, _ = engine(photo)
    out = []
    for l in line_boxes(res):
        y0 = min(b[0] for b in l["items"]); y1 = max(b[1] for b in l["items"])
        x0 = min(b[2] for b in l["items"]); x1 = max(b[3] for b in l["items"])
        p = max(2, int((y1 - y0) * 0.15))
        crop = im.crop((max(0, int(x0) - p), max(0, int(y0) - p), min(im.width, int(x1) + p), min(im.height, int(y1) + p)))
        if crop.height < 32:
            s = 32 / crop.height; crop = crop.resize((int(crop.width * s), 32))
        out.append(tess(crop, lang))
    return "".join(t + "\n" for t in out)

if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    k, n = (int(sys.argv[3]), int(sys.argv[4])) if len(sys.argv) > 4 else (1, 1)
    os.makedirs(dst, exist_ok=True)
    eng = RapidOCR(); t0 = time.time()
    files = sorted(f for f in os.listdir(src) if f.endswith(".jpg"))[k-1::n]
    for f in files:
        o = os.path.join(dst, f[:-4] + ".txt")
        if not os.path.exists(o):
            open(o, "w").write(read(os.path.join(src, f), eng))
    print(f"{k}/{n}: {len(files)} in {time.time()-t0:.0f}s")
