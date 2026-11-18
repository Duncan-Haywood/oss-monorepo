"""Milestone 7q: collect the component data that checks the sizing closure (battery specific energy, motor mass against maximum
thrust, propulsive efficiency) from retailers' public product listings, and write it as CSV under data/components/.

Sources (Shopify stores' public `products.json`, accessed 2026-11-16):
  - sunnyskyusa.com: SunnySky's US store. Its motor pages carry the manufacturer's bench tables (propeller, voltage, throttle or RPM, current,
    thrust in gram-force, electrical watts, g/W; column order varies by page, so only propeller, thrust and watts are kept) and the motor's weight. Every parsed table row is kept, with the page URL.
  - www.racedayquads.com, pyrodrone.com, www.rotorriot.com, newbeedrone.com, fpvcycle.com, www.diatone.us: FPV retailers. Battery
    listings give capacity (mAh), cell count and weight in the title and description; a few motor listings state a maximum thrust.

Usage: python3 collect.py <cache_dir>   (downloads each store's catalogue into <cache_dir> once, then parses; stdlib only)
Listings change: the CSVs in data/components/ are the 2026-11-16 snapshot and are what fit.py reads. Rerunning later gives a
different snapshot, not a reproduction.

Filters, all applied before any fit and reported in the CSVs' `use` column:
  batteries - titles naming a pack (mAh and cell count) with a weight in the description; accessories excluded by title keyword;
    rows whose computed specific energy is outside 50-320 Wh/kg are kept but marked `excluded: implausible` (listings whose first
    "weight" is a per-cell or per-packet figure, or a capacity in the title that belongs to a different product); packs 3S-6S and
    1000-10000 mAh are the ones a 0.5-3 kg vehicle carries, others are marked `excluded: out of class`; duplicates (same brand
    word, capacity, cells and weight across stores) are kept once.
  motors (bench) - every table row whose efficiency column equals thrust / watts within 5% (the check that the five numbers were
    read in the right order); the propeller diameter is read from the propeller name.
  motors (listed max thrust) - FPV listings that state "max thrust" and a weight; one row per product.
"""
import csv, html, json, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "data", "components")
STORES = ["sunnyskyusa.com", "www.racedayquads.com", "pyrodrone.com", "www.rotorriot.com", "newbeedrone.com", "fpvcycle.com",
          "www.diatone.us"]


def fetch(store, cache):
    path = os.path.join(cache, store + ".json")
    if not os.path.exists(path):
        allp = []
        for page in range(1, 60):
            out = subprocess.run(["curl", "-s", "-m", "60", "-L", f"https://{store}/products.json?limit=250&page={page}"],
                                 capture_output=True).stdout
            p = json.loads(out)["products"]
            if not p:
                break
            allp += p
        json.dump(allp, open(path, "w"))
    return json.load(open(path))


def text(p, sep=" "):
    t = html.unescape(re.sub("<[^>]+>", sep, p.get("body_html") or ""))
    return re.sub(r"(\s*\|\s*)+", " | ", t) if sep == " | " else re.sub(r"\s+", " ", t)


def num(tok):
    try:
        return float(tok)
    except ValueError:
        return None


def prop_in(tok):
    """Propeller diameter in inches from a name such as 'EOLO CN15*5.5', 'APC1047', 'GF5045*3', 'T-MOTOR 1555', '5x4.3x3'."""
    m = re.search(r"(?<![\d.])(\d{1,2}(?:\.\d)?)\s*[*xX×]\s*\d", tok)
    if m and 2 <= float(m.group(1)) <= 40:
        return float(m.group(1))
    m = re.search(r"(?<!\d)(\d{4})(?!\d)", tok)
    if m:
        a = int(m.group(1)[:2])
        return float(a) if 10 <= a <= 40 else float(m.group(1)[0])
    return None


def bench_rows(p):
    t = text(p, " | ")
    toks = [x.strip() for x in t.split("|")]
    w = re.search(r"\|\s*Weight\s*\|\s*(\d+(?:\.\d+)?)\s*g", t) or re.search(r"[Ww]eight[^0-9|]{0,30}\|?\s*(\d+(?:\.\d+)?)\s*g", t)
    weight = float(w.group(1)) if w else None
    rows, D, i = [], None, 0
    while i < len(toks):
        tok = toks[i]
        if num(tok) is None and len(tok) < 40 and re.fullmatch(r"[A-Za-z\- ]*\d+(?:\.\d+)?(?:\s*[*xX×]\s*\d+(?:\.\d+)?){0,2}(?:\s*\w+)?", tok):
            d = prop_in(tok)
            if d is not None:
                D = d
        vals = [num(x) for x in toks[i:i + 5]]
        if None not in vals and len(vals) == 5:
            rpm, amps, thrust, watts, eff = vals
            if rpm >= 300 and watts > 0 and thrust > 0 and abs(thrust / watts - eff) <= 0.05 * eff:
                rows.append(dict(prop_in=D, thrust_gf=thrust, watts=watts))
                i += 5
                continue
        i += 1
    return weight, rows


def main(cache):
    os.makedirs(cache, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)
    shops = {s: fetch(s, cache) for s in STORES}
    # 1. SunnySky bench tables
    with open(os.path.join(OUT, "motors_bench_sunnysky.csv"), "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["motor", "weight_g", "prop_in", "thrust_gf", "watts", "url"])
        nm = 0
        for p in shops["sunnyskyusa.com"]:
            if "motor" not in (p.get("product_type") or "").lower():
                continue
            weight, rows = bench_rows(p)
            if not rows or weight is None:
                continue
            nm += 1
            url = f"https://sunnyskyusa.com/products/{p['handle']}"
            for r in rows:
                wr.writerow([p["title"].strip(), weight, r["prop_in"], r["thrust_gf"], r["watts"], url])
        print("sunnysky motors with bench tables:", nm)
    # 2. FPV motor listings stating a maximum thrust
    seen = set()
    with open(os.path.join(OUT, "motors_listed_max.csv"), "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["motor", "weight_g", "max_thrust_g", "quote", "url"])
        for s in STORES[1:]:
            for p in shops[s]:
                if "motor" not in (p.get("product_type", "") + p["title"]).lower():
                    continue
                t = text(p)
                th = re.search(r"[Mm]ax(?:imum)?\.? ?[Tt]hrust[^0-9]{0,40}?([0-9][0-9.,]*) ?(kg|g)\b", t)
                w = re.search(r"[Ww]eight[^0-9]{0,40}?([0-9]+(?:\.[0-9]+)?) ?g\b", t)
                if not (th and w):
                    continue
                key = re.sub(r"[^a-z0-9]", "", p["title"].lower())[:40]
                if key in seen:
                    continue
                seen.add(key)
                thrust = float(th.group(1).replace(",", "")) * (1000 if th.group(2) == "kg" else 1)
                q = t[max(0, th.start() - 10):th.end() + 5] + " ... " + t[max(0, w.start() - 5):w.end() + 2]
                wr.writerow([p["title"].strip(), float(w.group(1)), thrust, q, f"https://{s}/products/{p['handle']}"])
    # 3. batteries
    seen, n = set(), 0
    with open(os.path.join(OUT, "batteries.csv"), "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(["title", "chemistry", "cells", "mah", "weight_g", "wh_per_kg", "use", "quote", "url"])
        for s in STORES[1:]:
            for p in shops[s]:
                ti = p["title"]
                low = ti.lower() + " " + (p.get("product_type") or "").lower()
                if not re.search(r"lipo|li-ion|liion|li-po|lihv|lithium", low):
                    continue
                if re.search(r"charger|strap|pad|checker|bag|lead|cable|adapter|connector|alarm|holder|box|case|balance board|pigtail|mount|tester|"
                             r"radio|transmitter|goggle|bnf|rtf|pnp|frame|kit|combo|drone|quad|whoop|tx16|zorro|boxer|pocket", ti.lower()):
                    continue
                cap = re.search(r"(\d{3,5}) ?mAh", ti, re.I)
                cells = re.search(r"(?<!\d)(\d)S\b", ti)
                t = text(p)
                w = re.search(r"[Ww]eight[^0-9]{0,25}?(\d{2,4}(?:\.\d+)?) ?(?:g|grams)\b", t)
                if not (cap and cells and w):
                    continue
                mah, S, wg = int(cap.group(1)), int(cells.group(1)), float(w.group(1))
                chem = "lihv" if re.search(r"\bhv\b|lihv", ti.lower()) else ("liion" if re.search(r"li-?ion|lithium-ion|18650|21700", ti.lower()) else "lipo")
                vcell = {"lipo": 3.7, "lihv": 3.8, "liion": 3.6}[chem]
                whkg = mah / 1000 * vcell * S / (wg / 1000)
                brand = ti.split()[0].lower()
                key = (brand, mah, S, wg)
                if key in seen:
                    continue
                seen.add(key)
                use = "fit"
                if not 50 <= whkg <= 320:
                    use = "excluded: implausible"
                elif not (3 <= S <= 6 and 1000 <= mah <= 10000):
                    use = "excluded: out of class"
                q = t[max(0, w.start() - 5):w.end() + 2]
                wr.writerow([ti.strip(), chem, S, mah, wg, round(whkg, 1), use, q, f"https://{s}/products/{p['handle']}"])
                n += 1
        print("battery rows:", n)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "_cache"))
