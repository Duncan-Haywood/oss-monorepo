#!/usr/bin/env python3
"""The search-ranking feedback loop for https://marisstella.app/.

Does the site turn up when a person searches Google, or when an AI agent runs
a web search? This measures that, appends every reading to
``platform/seo/history/observations.jsonl``, and reports the trend, so a
change to the site can be judged by whether the numbers moved.

Subcommands (standard library only; ``gsc`` also needs the ``openssl`` CLI):

  next     which tracked queries to probe now (least recently observed first)
  record   store what a search showed for a query: a session runs its own web
           search (the AI-agent view), then passes the result URLs in order
  brave    probe every query through the Brave Search API (BRAVE_API_KEY)
  gsc      pull clicks, impressions and position from Google Search Console
           (GSC_SERVICE_ACCOUNT_JSON; the owner creates it, see README.md)
  audit    fetch the live site and check what blocks indexing: robots.txt,
           sitemaps, a sample of pages (status, noindex, canonical, title,
           description, h1, JSON-LD), llms.txt, IndexNow and verification files
  report   the scorecard: per engine and tier, how many queries find us and
           at what rank, against the previous reading. ``--write`` saves it to
           platform/seo/STATUS.md

Exit codes: 0 done; 1 the audit found a defect; 2 nothing was measured (no
key, no egress), which is "unmeasured", never "zero".
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import random
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
QUERIES = HERE / "queries.json"
HISTORY = HERE / "history" / "observations.jsonl"
STATUS = HERE / "STATUS.md"
VERIFICATION = HERE / "site-verification.json"
UA = "marisstella-seo-probe/1.0 (+https://marisstella.app/)"

EXIT_OK, EXIT_DEFECT, EXIT_UNMEASURED = 0, 1, 2


# --------------------------------------------------------------------------
# Files


def load_queries(path: Path | None = None) -> dict:
    path = path or QUERIES
    data = json.loads(path.read_text())
    ids = [q["id"] for q in data["queries"]]
    dupes = {i for i in ids if ids.count(i) > 1}
    if dupes:
        raise SystemExit(f"duplicate query ids in {path}: {sorted(dupes)}")
    for q in data["queries"]:
        if q.get("tier") not in ("brand", "name", "intent"):
            raise SystemExit(f"query {q['id']}: tier must be brand, name or intent")
    return data


def active(queries: dict) -> list[dict]:
    return [q for q in queries["queries"] if not q.get("retired")]


def read_history(path: Path | None = None) -> list[dict]:
    path = path or HISTORY
    if not path.exists():
        return []
    rows = []
    for n, line in enumerate(path.read_text().splitlines(), 1):
        line = line.strip()
        if line:
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as e:
                raise SystemExit(f"{path}:{n}: not JSON ({e})")
    return rows


def append_history(rows: list[dict], path: Path | None = None) -> None:
    path = path or HISTORY
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        for r in rows:
            f.write(json.dumps(r, sort_keys=True) + "\n")


def today() -> str:
    return dt.date.today().isoformat()


# --------------------------------------------------------------------------
# Ranking a result list


def norm(url: str) -> str:
    """Compare URLs without scheme case, www., query, fragment or trailing slash."""
    p = urllib.parse.urlsplit(url.strip())
    host = p.netloc.lower().removeprefix("www.")
    return f"{host}{p.path.rstrip('/')}"


def canonical_key(url: str) -> str:
    """The URL as a search engine keys it: scheme, host (www. kept), path and query.

    ``norm`` is for matching result lists and deliberately forgiving; a canonical
    link is not. Google treats http:// vs https://, www. vs bare and ?utm=
    variants as different URLs, so a canonical naming any of them points the
    index at another page. Only host case, the default port, the fragment and
    a trailing slash are ignored (the slash is reported apart, as a warning)."""
    p = urllib.parse.urlsplit(url.strip())
    host = (p.hostname or "").lower()
    if p.port and p.port != {"http": 80, "https": 443}.get(p.scheme.lower()):
        host += f":{p.port}"
    q = f"?{p.query}" if p.query else ""
    return f"{p.scheme.lower()}://{host}{p.path.rstrip('/')}{q}"


def rank_of(urls: list[str], expect: str, site: str) -> dict:
    """Where the expected page, and the site at all, first appear in ``urls``.

    ``rank`` is 1-based for the expected page (prefix match); ``site_rank`` is
    the first result anywhere on the site, which is the earlier signal: a brand
    query answered by a product page still means the domain is indexed.
    """
    want, host = norm(expect), norm(site)
    rank = site_rank = None
    hit_url = None
    for i, u in enumerate(urls, 1):
        n = norm(u)
        on_site = n == host or n.startswith(host + "/")
        if on_site and site_rank is None:
            site_rank = i
        if on_site and rank is None and (n == want or n.startswith(want + "/")):
            rank, hit_url = i, u
    return {"found": rank is not None, "rank": rank, "site_rank": site_rank,
            "url": hit_url, "results_seen": len(urls)}


def observation(engine: str, q: dict, ranked: dict, note: str = "", date: str | None = None) -> dict:
    return {"date": date or today(), "engine": engine, "query_id": q["id"],
            "tier": q["tier"], "query": q["query"], **ranked, "note": note}


# --------------------------------------------------------------------------
# next / record


def cmd_next(args) -> int:
    queries = load_queries()
    last: dict[str, str] = {}
    for r in read_history():
        if r.get("engine") == args.engine and "query_id" in r:
            last[r["query_id"]] = max(last.get(r["query_id"], ""), r["date"])
    order = sorted(active(queries), key=lambda q: (last.get(q["id"], ""), q["id"]))
    for q in order[: args.n]:
        seen = last.get(q["id"], "never")
        print(f"{q['id']}\t{seen}\t{q['query']}")
    return EXIT_OK


def cmd_record(args) -> int:
    queries = load_queries()
    by_id = {q["id"]: q for q in queries["queries"]}
    q = by_id.get(args.query_id)
    if q is None:
        print(f"unknown query id {args.query_id!r}; see {QUERIES}", file=sys.stderr)
        return EXIT_UNMEASURED
    urls = list(args.urls)
    if args.urls_file:
        urls += [u for u in Path(args.urls_file).read_text().split() if u.startswith("http")]
    if not urls and not args.empty:
        print("no result URLs given; pass --empty if the search really returned none",
              file=sys.stderr)
        return EXIT_UNMEASURED
    obs = observation(args.engine, q, rank_of(urls, q["expect"], queries["site"]),
                      note=args.note, date=args.date)
    append_history([obs])
    print(json.dumps(obs))
    return EXIT_OK


# --------------------------------------------------------------------------
# HTTP


def http(url: str, *, data: bytes | None = None, headers: dict | None = None,
         timeout: float = 20.0) -> tuple[int, dict, bytes]:
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, resp.read()
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read()
    except (urllib.error.URLError, OSError) as e:
        # DNS, refused connection, TLS, timeout: no answer at all. Status 0 lets
        # callers say "unmeasured" (exit 2) instead of a traceback (exit 1, which
        # means "the audit found a defect").
        reason = getattr(e, "reason", e)
        return NO_ANSWER, {}, f"{type(e).__name__}: {reason}".encode()


NO_ANSWER = 0


def egress_refused(status: int, body: bytes) -> bool:
    """The session proxy's own refusal, or no answer at all, not the remote service's."""
    if status == NO_ANSWER:
        return True
    text = body[:2000].decode("utf-8", "replace").lower()
    return status in (403, 407) and ("allowlist" in text or "egress" in text)


# --------------------------------------------------------------------------
# Brave Search API


def brave_urls(payload: dict) -> list[str]:
    return [r["url"] for r in payload.get("web", {}).get("results", []) if r.get("url")]


def cmd_brave(args) -> int:
    key = os.environ.get("BRAVE_API_KEY")
    if not key:
        print("BRAVE_API_KEY is not set: unmeasured (see README.md, 'Engines').")
        return EXIT_UNMEASURED
    queries = load_queries()
    rows = []
    for q in active(queries):
        url = "https://api.search.brave.com/res/v1/web/search?" + urllib.parse.urlencode(
            {"q": q["query"], "count": 20})
        status, _, body = http(url, headers={"Accept": "application/json",
                                             "X-Subscription-Token": key})
        if egress_refused(status, body):
            print("no egress to api.search.brave.com from here: unmeasured.")
            return EXIT_UNMEASURED
        if status != 200:
            print(f"{q['id']}: Brave answered {status}; stopping", file=sys.stderr)
            break
        obs = observation("brave", q, rank_of(brave_urls(json.loads(body)), q["expect"],
                                               queries["site"]))
        rows.append(obs)
        print(f"{q['id']}: rank={obs['rank']} site_rank={obs['site_rank']}")
    if not rows:
        return EXIT_UNMEASURED
    append_history(rows)
    return EXIT_OK


# --------------------------------------------------------------------------
# Google Search Console


def b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def jwt_unsigned(email: str, now: int,
                 scope: str = "https://www.googleapis.com/auth/webmasters.readonly") -> str:
    header = {"alg": "RS256", "typ": "JWT"}
    claims = {"iss": email, "scope": scope, "aud": "https://oauth2.googleapis.com/token",
              "iat": now, "exp": now + 3600}
    return b64url(json.dumps(header).encode()) + "." + b64url(json.dumps(claims).encode())


def rs256(message: str, private_key_pem: str) -> str:
    """Sign with the openssl CLI so the loop needs no Python packages."""
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".pem") as f:
        f.write(private_key_pem)
        key_path = f.name
    try:
        os.chmod(key_path, 0o600)
        out = subprocess.run(["openssl", "dgst", "-sha256", "-sign", key_path],
                             input=message.encode(), capture_output=True, check=True)
        return b64url(out.stdout)
    finally:
        os.unlink(key_path)


def gsc_token(sa: dict) -> str | None:
    unsigned = jwt_unsigned(sa["client_email"], int(dt.datetime.now().timestamp()))
    assertion = unsigned + "." + rs256(unsigned, sa["private_key"])
    body = urllib.parse.urlencode({"grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                                   "assertion": assertion}).encode()
    status, _, resp = http("https://oauth2.googleapis.com/token", data=body,
                           headers={"Content-Type": "application/x-www-form-urlencoded"})
    if egress_refused(status, resp):
        return None
    if status != 200:
        raise RuntimeError(f"token exchange answered {status}: {resp[:300]!r}")
    return json.loads(resp)["access_token"]


def gsc_rows_to_observations(rows: list[dict], queries: dict, start: str, end: str) -> list[dict]:
    """Search Analytics rows (dimensions query, page) -> one observation each tracked query,
    plus one ``site`` total. Position is Google's impression-weighted average."""
    obs = []
    total_clicks = sum(r.get("clicks", 0) for r in rows)
    total_impr = sum(r.get("impressions", 0) for r in rows)
    obs.append({"date": end, "engine": "gsc", "query_id": "_site", "tier": "site",
                "window": [start, end], "clicks": total_clicks, "impressions": total_impr,
                "distinct_queries": len({r["keys"][0] for r in rows}),
                "distinct_pages": len({r["keys"][1] for r in rows}), "note": ""})
    for q in active(queries):
        mine = [r for r in rows if r["keys"][0].strip().lower() == q["query"].strip().lower()]
        impr = sum(r.get("impressions", 0) for r in mine)
        pos = (sum(r["position"] * r["impressions"] for r in mine) / impr) if impr else None
        hit = [r for r in mine if norm(r["keys"][1]).startswith(norm(q["expect"]))]
        obs.append({"date": end, "engine": "gsc", "query_id": q["id"], "tier": q["tier"],
                    "query": q["query"], "window": [start, end],
                    "found": bool(hit), "rank": round(pos, 1) if pos else None,
                    "site_rank": round(pos, 1) if pos else None, "url": hit[0]["keys"][1] if hit else None,
                    "clicks": sum(r.get("clicks", 0) for r in mine), "impressions": impr, "note": ""})
    return obs


def cmd_gsc(args) -> int:
    raw = os.environ.get("GSC_SERVICE_ACCOUNT_JSON")
    if not raw:
        print("GSC_SERVICE_ACCOUNT_JSON is not set: unmeasured (see README.md, 'Owner steps').")
        return EXIT_UNMEASURED
    queries = load_queries()
    prop = os.environ.get("GSC_PROPERTY", "sc-domain:marisstella.app")
    end = dt.date.today() - dt.timedelta(days=3)  # GSC lags about two to three days
    start = end - dt.timedelta(days=27)
    token = gsc_token(json.loads(raw))
    if token is None:
        print("no answer from oauth2.googleapis.com from here: unmeasured.")
        return EXIT_UNMEASURED
    url = ("https://www.googleapis.com/webmasters/v3/sites/"
           + urllib.parse.quote(prop, safe="") + "/searchAnalytics/query")
    body = json.dumps({"startDate": start.isoformat(), "endDate": end.isoformat(),
                       "dimensions": ["query", "page"], "rowLimit": 25000}).encode()
    status, _, resp = http(url, data=body, headers={"Authorization": f"Bearer {token}",
                                                    "Content-Type": "application/json"})
    if egress_refused(status, resp):
        print("no egress to googleapis.com from here: unmeasured.")
        return EXIT_UNMEASURED
    if status != 200:
        print(f"Search Console answered {status}: {resp[:300]!r}", file=sys.stderr)
        return EXIT_UNMEASURED
    obs = gsc_rows_to_observations(json.loads(resp).get("rows", []), queries,
                                   start.isoformat(), end.isoformat())
    append_history(obs)
    site = obs[0]
    print(f"{start}..{end}: {site['impressions']} impressions, {site['clicks']} clicks, "
          f"{site['distinct_queries']} queries, {site['distinct_pages']} pages")
    return EXIT_OK


# --------------------------------------------------------------------------
# Live audit


TAG = re.compile(r"<(meta|link)\b[^>]*>", re.I)


def attr(tag: str, name: str) -> str | None:
    m = re.search(rf'\b{name}\s*=\s*(?:(["\'])(.*?)\1|([^\s"\'=<>`]+))', tag, re.I | re.S)
    if not m:
        return None
    return m.group(2) if m.group(1) else m.group(3)


def audit_page(url: str, status: int, headers: dict, html: str) -> tuple[list[str], list[str]]:
    """(blockers, warnings) for one fetched page.

    Blockers keep a page out of an index (status, noindex, a canonical naming
    another URL). Warnings cost snippet quality: Google rewrites a long title
    rather than dropping the page."""
    problems: list[str] = []
    warnings: list[str] = []
    if status != 200:
        return [f"{url}: HTTP {status}"], []
    if "noindex" in headers.get("x-robots-tag", "").lower():
        problems.append(f"{url}: X-Robots-Tag noindex")
    canonical = None
    for m in TAG.finditer(html):
        tag = m.group(0)
        if m.group(1).lower() == "meta" and (attr(tag, "name") or "").lower() in ("robots", "googlebot"):
            if "noindex" in (attr(tag, "content") or "").lower():
                problems.append(f"{url}: meta robots noindex")
        if m.group(1).lower() == "link" and (attr(tag, "rel") or "").lower() == "canonical":
            canonical = attr(tag, "href")
    if not canonical:
        problems.append(f"{url}: no canonical link")
    else:
        target = urllib.parse.urljoin(url, canonical)
        if canonical_key(target) != canonical_key(url):
            problems.append(f"{url}: canonical names {canonical}")
        elif urllib.parse.urlsplit(target).path != urllib.parse.urlsplit(url).path:
            warnings.append(f"{url}: canonical {canonical} differs by a trailing slash")
    title = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    if not title or not title.group(1).strip():
        problems.append(f"{url}: no <title>")
    elif len(title.group(1).strip()) > 70:
        warnings.append(f"{url}: <title> is {len(title.group(1).strip())} chars (results show ~60)")
    if not re.search(r'<meta\b[^>]*\bname=["\']description["\']', html, re.I):
        warnings.append(f"{url}: no meta description")
    h1s = len(re.findall(r"<h1\b", html, re.I))
    if h1s != 1:
        warnings.append(f"{url}: {h1s} <h1> elements")
    if "application/ld+json" not in html:
        warnings.append(f"{url}: no JSON-LD")
    return problems, warnings


def sitemap_locs(xml: str) -> list[str]:
    return re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)


def cmd_audit(args) -> int:
    queries = load_queries()
    site = args.site or queries["site"]
    problems: list[str] = []
    warnings: list[str] = []
    status, _, body = http(urllib.parse.urljoin(site, "robots.txt"))
    if egress_refused(status, body):
        print(f"no egress to {site}: unmeasured.")
        return EXIT_UNMEASURED
    robots = body.decode("utf-8", "replace")
    if status != 200:
        problems.append(f"robots.txt: HTTP {status}")
    if re.search(r"(?im)^\s*disallow:\s*/\s*$", robots):
        problems.append("robots.txt disallows /")
    sitemaps = re.findall(r"(?im)^\s*sitemap:\s*(\S+)", robots)
    if not sitemaps:
        problems.append("robots.txt names no Sitemap:")
    urls: list[str] = []
    child_maps = 0
    for sm in sitemaps:
        s, _, b = http(sm)
        if s != 200:
            problems.append(f"{sm}: HTTP {s}")
            continue
        locs = sitemap_locs(b.decode("utf-8", "replace"))
        if "<sitemapindex" in b[:500].decode("utf-8", "replace"):
            child_maps += len(locs)
            # Every child is listed; only a sample is fetched, to stay polite.
            rng = random.Random(args.seed or today())
            for child in rng.sample(locs, min(args.sitemaps, len(locs))):
                cs, _, cb = http(child)
                if cs != 200:
                    problems.append(f"{child}: HTTP {cs}")
                else:
                    urls += sitemap_locs(cb.decode("utf-8", "replace"))
        else:
            urls += locs
    off_site = [u for u in urls if not norm(u).startswith(norm(site))]
    if off_site:
        problems.append(f"sitemaps list {len(off_site)} URLs off {site}, e.g. {off_site[0]}")
    rng = random.Random(args.seed or today())
    sample = [site] + rng.sample(urls, min(args.pages, len(urls)))
    for u in sample:
        s, h, b = http(u)
        if s == NO_ANSWER:
            problems.append(f"{u}: no answer ({b.decode('utf-8', 'replace')[:120]})")
            continue
        blockers, warns = audit_page(u, s, h, b.decode("utf-8", "replace"))
        problems += blockers
        warnings += warns
    for extra in ("llms.txt",):
        s, _, _ = http(urllib.parse.urljoin(site, extra))
        if s != 200:
            problems.append(f"{extra}: HTTP {s}")
    home = http(site)[2].decode("utf-8", "replace")
    for tag in verification_tags(load_verification()):
        if tag not in home:
            problems.append(f"home page lacks {tag} (merged but not deployed yet?)")
    if not verification_tags(load_verification()):
        warnings.append("no Search Console / Bing verification token configured "
                        "(platform/seo/site-verification.json): rankings stay unmeasured")
    obs = {"date": today(), "engine": "audit", "query_id": "_audit", "tier": "site",
           "pages_checked": len(sample), "child_sitemaps": child_maps,
           "urls_in_sampled_sitemaps": len(urls), "problems": len(problems),
           "warnings": len(warnings), "examples": (problems + warnings)[:10], "note": ""}
    if not args.dry_run:
        append_history([obs])
    print(f"audit {site}: {len(sample)} pages, {child_maps} child sitemaps, "
          f"{len(problems)} blocker(s), {len(warnings)} warning(s)")
    for p in problems:
        print("  BLOCKER", p)
    for w in warnings:
        print("  warn   ", w)
    return EXIT_DEFECT if problems else EXIT_OK


META_NAME = {"google": "google-site-verification", "bing": "msvalidate.01",
             "yandex": "yandex-verification"}


def load_verification(path: Path | None = None) -> dict:
    path = path or VERIFICATION
    return json.loads(path.read_text()) if path.exists() else {}


def verification_tags(conf: dict) -> list[str]:
    """The tags ``platform/pages/site-verification.mjs`` writes into the home page;
    platform/ci/test_seo_probe.py
    keeps the two in step."""
    return [f'<meta name="{name}" content="{tok}">'
            for engine, name in META_NAME.items() for tok in conf.get(engine, [])]


# --------------------------------------------------------------------------
# Report


def latest_by(rows: list[dict], engine: str, before: str | None = None) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for r in rows:
        if r.get("engine") != engine or (before and r["date"] >= before):
            continue
        cur = out.get(r["query_id"])
        if cur is None or r["date"] >= cur["date"]:
            out[r["query_id"]] = r
    return out


def scorecard(rows: list[dict], queries: dict) -> str:
    lines = ["# Search ranking status", "",
             "Generated by `python3 platform/seo/probe.py report --write` from "
             "`history/observations.jsonl`. Do not edit by hand.", ""]
    engines = sorted({r["engine"] for r in rows if r.get("engine") not in ("audit",)})
    tracked = active(queries)
    if not engines:
        lines.append("No search readings yet: unmeasured, not zero.")
    for engine in engines:
        now = latest_by(rows, engine)
        last_date = max((r["date"] for r in now.values()), default="")
        prev = latest_by(rows, engine, before=last_date)
        lines += [f"## {engine} (latest reading {last_date})", "",
                  "| tier | queries observed | find our page | find the site | best rank | change since previous |",
                  "|---|---|---|---|---|---|"]
        for tier in ("brand", "name", "intent"):
            ids = [q["id"] for q in tracked if q["tier"] == tier]
            seen = [now[i] for i in ids if i in now]
            if not seen:
                lines.append(f"| {tier} | 0 of {len(ids)} | - | - | - | - |")
                continue
            found = sum(1 for r in seen if r.get("found"))
            site_found = sum(1 for r in seen if r.get("site_rank"))
            ranks = [r["rank"] for r in seen if r.get("rank")]
            before = [prev[i] for i in ids if i in prev]
            delta = "first reading" if not before else \
                f"{found - sum(1 for r in before if r.get('found')):+d} found"
            lines.append(f"| {tier} | {len(seen)} of {len(ids)} | {found} | {site_found} | "
                         f"{min(ranks) if ranks else '-'} | {delta} |")
        site_row = now.get("_site")
        if site_row:
            lines += ["", f"Search Console {site_row['window'][0]}..{site_row['window'][1]}: "
                      f"{site_row['impressions']} impressions, {site_row['clicks']} clicks, "
                      f"{site_row['distinct_queries']} distinct queries, "
                      f"{site_row['distinct_pages']} pages."]
        lines.append("")
    audits = [r for r in rows if r.get("engine") == "audit"]
    if audits:
        a = max(audits, key=lambda r: r["date"])
        lines += [f"## Live audit ({a['date']})", "",
                  f"{a['pages_checked']} pages checked, {a['child_sitemaps']} child sitemaps, "
                  f"{a['problems']} blocker(s), {a.get('warnings', 0)} warning(s).", ""]
        lines += [f"- {e}" for e in a.get("examples", [])]
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def cmd_report(args) -> int:
    text = scorecard(read_history(), load_queries())
    if args.write:
        STATUS.write_text(text)
    print(text)
    return EXIT_OK


# --------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    n = sub.add_parser("next")
    n.add_argument("--engine", default="claude-websearch")
    n.add_argument("-n", type=int, default=8)
    r = sub.add_parser("record")
    r.add_argument("query_id")
    r.add_argument("urls", nargs="*")
    r.add_argument("--engine", default="claude-websearch",
                   help="who ran the search, e.g. claude-websearch, google-manual")
    r.add_argument("--urls-file")
    r.add_argument("--empty", action="store_true", help="the search returned no results")
    r.add_argument("--note", default="")
    r.add_argument("--date")
    sub.add_parser("brave")
    sub.add_parser("gsc")
    a = sub.add_parser("audit")
    a.add_argument("--site")
    a.add_argument("--pages", type=int, default=25)
    a.add_argument("--sitemaps", type=int, default=10)
    a.add_argument("--seed")
    a.add_argument("--dry-run", action="store_true", help="print, do not record")
    rep = sub.add_parser("report")
    rep.add_argument("--write", action="store_true")
    args = p.parse_args(argv)
    return {"next": cmd_next, "record": cmd_record, "brave": cmd_brave, "gsc": cmd_gsc,
            "audit": cmd_audit, "report": cmd_report}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
