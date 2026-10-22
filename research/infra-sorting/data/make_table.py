"""Build data/taco_items.csv (one row per TACO annotation) from TACO's annotations.json.

Usage: python3 data/make_table.py [path/to/annotations.json]
With no argument it downloads
https://raw.githubusercontent.com/pedropro/TACO/master/data/annotations.json.
Columns: category, supercategory, rel_size = sqrt(bbox area / image area), the object's
linear size as a fraction of the photo's width.
"""
import csv, json, os, sys, urllib.request

URL = "https://raw.githubusercontent.com/pedropro/TACO/master/data/annotations.json"
here = os.path.dirname(os.path.abspath(__file__))
if len(sys.argv) > 1:
    d = json.load(open(sys.argv[1]))
else:
    d = json.load(urllib.request.urlopen(URL, timeout=120))
cats = {c["id"]: (c["name"], c["supercategory"]) for c in d["categories"]}
imgs = {i["id"]: i["width"] * i["height"] for i in d["images"]}
with open(os.path.join(here, "taco_items.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["category", "supercategory", "rel_size"])
    for a in d["annotations"]:
        n, s = cats[a["category_id"]]
        bw, bh = a["bbox"][2], a["bbox"][3]
        w.writerow([n, s, "%.5f" % ((bw * bh / imgs[a["image_id"]]) ** 0.5)])
