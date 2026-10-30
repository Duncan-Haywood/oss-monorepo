#!/usr/bin/env python3
"""Re-read the starting prices from the product pages they link, by hand.

Every price in prices.mjs, catalog.mjs and products.mjs names the page it was
read from. This script opens the ones on an allowlist of sellers whose
robots.txt lets anyone read their product pages, and prints what each page
says now beside what the file says, so a run can update those numbers from a
reading instead of from memory.

Allowed (2026-10-29): Shed Windows and More (a Shopify store: the product's
public `.json`), Shed Repair (WooCommerce: the schema.org Offer on the page)
and Hemlock Hardware (Shopify). Their robots.txt files allow product pages.

Not read, on purpose: Home Depot, Lowe's and Menards. Their pages show no
price to a plain request or put automated requests behind a bot challenge,
and big-box terms of use forbid scraping. Their prices stay as read from
search results, with a note saying so; a person checks them in a browser.

Start it by hand. It makes one request per page with a pause between them.
Do not schedule it.

Usage:
    python3 ventures/shed-designer/recheck_prices.py            # table
    python3 ventures/shed-designer/recheck_prices.py --json     # for a script
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
# Sellers whose robots.txt allows reading product pages; nothing else is fetched.
ALLOWED = ("shedwindowsandmore.com", "shedrepair.net", "hemlockhardware.com")

DUMP = """
const { LISTED_LUMBER, LISTED_ITEMS } = await import('./prices.mjs');
const { OFFERS } = await import('./catalog.mjs');
const { PRODUCTS } = await import('./products.mjs');
const rows = [];
for (const [m, lens] of Object.entries(LISTED_LUMBER)) for (const [ft, l] of Object.entries(lens)) rows.push({ file: 'prices.mjs', key: `lumber:${m}:${ft}`, store: 'Home Depot', price: l.price, url: l.url });
for (const [k, l] of Object.entries(LISTED_ITEMS)) rows.push({ file: 'prices.mjs', key: k, store: l.store || 'Home Depot', price: l.price, url: l.url });
for (const [k, list] of Object.entries(OFFERS)) for (const o of list) rows.push({ file: 'catalog.mjs', key: k, store: o.store, price: o.price, url: o.url });
for (const p of PRODUCTS) rows.push({ file: 'products.mjs', key: `product:${p.id}`, store: p.store, price: p.price, url: p.url });
console.log(JSON.stringify(rows));
"""


def listings() -> list[dict]:
    out = subprocess.run(
        ["node", "--input-type=module", "-e", DUMP], cwd=HERE, check=True, capture_output=True, text=True
    )
    return json.loads(out.stdout)


def offer_price(page: str) -> float | None:
    """The first schema.org Offer price in the page's JSON-LD, however deeply nested."""

    def walk(node):
        if isinstance(node, list):
            for x in node:
                found = walk(x)
                if found is not None:
                    return found
        elif isinstance(node, dict):
            if "Offer" in str(node.get("@type", "")) or "price" in node or "lowPrice" in node:
                price = node.get("price", node.get("lowPrice"))
                if price not in (None, ""):
                    return float(price)
            for v in node.values():
                found = walk(v)
                if found is not None:
                    return found
        return None

    for block in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', page, re.S):
        try:
            found = walk(json.loads(block))
        except ValueError:
            continue
        if found is not None:
            return found
    return None


def shopify_price(body: str) -> float | None:
    try:
        variants = json.loads(body)["product"]["variants"]
    except (ValueError, KeyError):
        return None
    return min(float(v["price"]) for v in variants) if variants else None


def fetch(url: str) -> tuple[int, str]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (shed-designer price re-check, by hand; one request per page)"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except (urllib.error.URLError, TimeoutError) as e:
        return 0, str(e)


def read_now(url: str) -> tuple[str, float | None]:
    host = urllib.parse.urlsplit(url).hostname or ""
    if not any(host == h or host.endswith("." + h) for h in ALLOWED):
        return "not read", None
    if "shedwindowsandmore.com/products/" in url:
        code, body = fetch(url.split("?")[0] + ".json")
        return (str(code), shopify_price(body) if code == 200 else None)
    code, body = fetch(url)
    if code != 200:
        return str(code or "no answer"), None
    return "200", offer_price(body)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--pause", type=float, default=2.0, help="seconds between requests")
    args = ap.parse_args(argv)
    seen: dict[str, tuple[str, float | None]] = {}
    rows = []
    for row in listings():
        url = row["url"]
        if url not in seen:
            seen[url] = read_now(url)
            if seen[url][0] != "not read":
                time.sleep(args.pause)
        status, now = seen[url]
        rows.append({**row, "status": status, "now": now, "moved": now is not None and abs(now - row["price"]) >= 0.005})
    if args.json:
        print(json.dumps(rows, indent=1))
    else:
        for r in rows:
            if r["status"] == "not read":
                continue
            now = "-" if r["now"] is None else f"{r['now']:.2f}"
            flag = "MOVED" if r["moved"] else ("same" if r["now"] is not None else "no price")
            print(f"{flag:8} {r['file']:13} {r['key']:24} {r['store'][:22]:22} file {r['price']:>8.2f}  page {now:>8}  [{r['status']}]")
        skipped = sum(1 for r in rows if r["status"] == "not read")
        print(f"\n{skipped} listings at sellers not on the allowlist (Home Depot, Lowe's, Menards and others) were not read: check those in a browser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
