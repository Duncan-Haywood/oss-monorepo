# Turn CORD-v2 ground truth into receipt text (rows ordered top to bottom, words left to right)
# plus the labelled total, subtotal and tax. Input: one `ground_truth` JSON string per line, from
# https://huggingface.co/datasets/naver-clova-ix/cord-v2 (parquet, column `ground_truth`).
#   python3 eval/cord_text.py test_ground_truth.jsonl eval/cord/test.jsonl test
import json, sys
src, dst, split = sys.argv[1], sys.argv[2], sys.argv[3]
out = open(dst, "w")
for line in open(src):
    g = json.loads(line)
    rows = {}
    for vl in g["valid_line"]:
        for w in vl["words"]:
            q = w["quad"]
            rows.setdefault(w["row_id"], []).append(((q["y1"] + q["y3"]) / 2, q["x1"], w["text"]))
    ordered = sorted(rows.values(), key=lambda ws: sum(y for y, _, _ in ws) / len(ws))
    text = "\n".join(" ".join(t for _, _, t in sorted(ws, key=lambda w: w[1])) for ws in ordered)
    p = g["gt_parse"]
    tot = p.get("total", {}); sub = p.get("sub_total", {})
    if isinstance(tot, list): tot = tot[0]
    if isinstance(sub, list): sub = sub[0]
    out.write(json.dumps({"id": f"{split}-{g['meta']['image_id']}", "total": tot.get("total_price"), "subtotal": sub.get("subtotal_price"), "tax": sub.get("tax_price"), "text": text}, ensure_ascii=False) + "\n")
