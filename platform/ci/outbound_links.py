#!/usr/bin/env python3
"""Check the citations on the paid products' live marketing pages.

The bets' front doors (the marketing sites and the free guides that send
buyers to them) cite statutes, regulations, vendor price pages and press
releases. A dead citation costs the page its credibility with a buyer and
with search engines, and nothing else catches it: the repository's link
checks read relative links in the source, never the outbound ones on the
served page. This crawls the live pages under each prefix and checks every
outbound link once.

    python3 platform/ci/outbound_links.py                 # the bets' front doors
    python3 platform/ci/outbound_links.py https://marisstella.app/jobshop/
    python3 platform/ci/outbound_links.py --json out.json # the full result too

Each link lands in one of three buckets:

  broken        404 or 410, or a host that does not resolve: fix the link.
  unverifiable  401, 403, 429, 5xx, a timeout or a refused connection. Many
                government and review sites refuse scripted requests (and
                some refuse this container's proxy), so this is not a
                finding; check it in a browser if it matters.
  double-escaped an href holding `&amp;amp;`: the page escaped an already
                escaped URL, so the browser follows a different address.

Exit 1 when anything is broken or double-escaped, else 0. Standard library
only; read-only (GET requests, nothing written but --json).
"""
import argparse
import concurrent.futures
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

FRONT_DOORS = [
    "https://marisstella.app/payapps/",
    "https://marisstella.app/pay-app-guides/",
    "https://marisstella.app/jobshop/",
    "https://marisstella.app/machine-shop-guides/",
    "https://marisstella.app/cmmc/",
    "https://marisstella.app/seller-books/",
]
OWN_HOST = "marisstella.app"
UA = "Mozilla/5.0 (compatible; outbound-link-check)"
SKIP_CRAWL = re.compile(r"\.(css|js|mjs|png|jpe?g|svg|webp|ico|xlsx|pdf|zip|xml|json|txt|csv|docx|webmanifest)$", re.I)
HREF = re.compile(r'href="([^"]+)"')


def fetch(url, body=True, timeout=25):
    """(status, text). Status is an int, or a short error name."""
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, (r.read(4_000_000).decode("utf-8", "replace") if body else "")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except urllib.error.URLError as e:
        reason = getattr(e, "reason", e)
        if "Name or service not known" in str(reason) or "nodename nor servname" in str(reason):
            return "dns", ""
        return type(reason).__name__, ""
    except Exception as e:  # timeouts, resets
        return type(e).__name__, ""


def classify(status):
    if status in (404, 410, "dns"):
        return "broken"
    if status == 200 or (isinstance(status, int) and 200 <= status < 400):
        return "ok"
    return "unverifiable"


def links_in(html, page):
    """Outbound and same-site links on one page, plus the double-escaped hrefs."""
    out, doubled = [], []
    for raw in HREF.findall(html):
        if "&amp;amp;" in raw:
            doubled.append(raw)
        href = raw.replace("&amp;", "&")
        url = urllib.parse.urljoin(page, href).split("#")[0]
        if url.startswith(("http://", "https://")):
            out.append(url)
    return out, doubled


def crawl(prefixes, fetch=fetch, max_pages=1500):
    """Walk the pages under the prefixes; map each outbound URL to the pages citing it."""
    seen, queue = set(), list(prefixes)
    cited, doubled = {}, {}
    while queue and len(seen) < max_pages:
        page = queue.pop(0)
        if page in seen:
            continue
        seen.add(page)
        status, html = fetch(page)
        if status != 200 or "<html" not in html[:2000].lower():
            continue
        urls, bad = links_in(html, page)
        for raw in bad:
            doubled.setdefault(raw, set()).add(page)
        for url in urls:
            if any(url.startswith(p) for p in prefixes):
                if url not in seen and not SKIP_CRAWL.search(urllib.parse.urlparse(url).path):
                    queue.append(url)
            elif urllib.parse.urlparse(url).hostname not in (OWN_HOST, f"www.{OWN_HOST}") and \
                    not (urllib.parse.urlparse(url).hostname or "").endswith(f".{OWN_HOST}"):
                cited.setdefault(url, set()).add(page)
    return seen, cited, doubled


def check(cited, fetch=fetch, workers=12):
    def one(url):
        status, _ = fetch(url, body=False)
        if classify(status) == "broken" and status != "dns":
            status, _ = fetch(url, body=False)  # one retry: a flaky 404 is rare but real
        return url, status
    with concurrent.futures.ThreadPoolExecutor(workers) as ex:
        return dict(ex.map(one, sorted(cited)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("prefixes", nargs="*", default=FRONT_DOORS)
    ap.add_argument("--json", help="write every result here")
    a = ap.parse_args(argv)
    pages, cited, doubled = crawl(a.prefixes)
    results = check(cited)
    buckets = {"broken": [], "unverifiable": [], "ok": []}
    for url, status in results.items():
        buckets[classify(status)].append((url, status))
    print(f"{len(pages)} pages under {len(a.prefixes)} prefixes; {len(cited)} outbound links: "
          f"{len(buckets['ok'])} ok, {len(buckets['unverifiable'])} unverifiable, "
          f"{len(buckets['broken'])} broken, {len(doubled)} double-escaped")
    for url, status in sorted(buckets["broken"]):
        print(f"BROKEN {status} {url}\n  cited on {', '.join(sorted(cited[url]))}")
    for raw, on in sorted(doubled.items()):
        print(f"DOUBLE-ESCAPED {raw}\n  on {', '.join(sorted(on))}")
    for url, status in sorted(buckets["unverifiable"], key=lambda x: str(x[1])):
        print(f"unverifiable {status} {url}")
    if a.json:
        with open(a.json, "w", encoding="utf-8") as f:
            json.dump({"pages": len(pages), "doubled": {k: sorted(v) for k, v in doubled.items()},
                       "links": {u: {"status": s, "bucket": classify(s), "cited_on": sorted(cited[u])}
                                 for u, s in results.items()}}, f, indent=1)
    return 1 if buckets["broken"] or doubled else 0


if __name__ == "__main__":
    sys.exit(main())
