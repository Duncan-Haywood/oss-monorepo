#!/usr/bin/env python3
"""Check the DOIs and arXiv ids a research README cites.

    python3 research/_shared/cite_check.py research/<slug>/README.md [more files]
    python3 research/_shared/cite_check.py --offline README.md   # list ids only
    python3 research/_shared/cite_check.py --no-write README.md  # do not update cite_check.json

Each identifier is looked up (Crossref for DOIs, DataCite when Crossref has no such DOI, the arXiv API for arXiv ids)
and printed with the title and year the registry holds, so you can compare it
with what the README claims the source says. A lookup that fails exits 1:
the id is mistyped or invented. A host that refuses the lookup (403, 429, 5xx,
as the cloud proxy sometimes does) or a connection that never completes
(proxy connect rejected, DNS, timeout) prints SKIP and does not fail the run;
open the source by hand and say in the README that it was not machine-checked. Citations without a DOI or arXiv id (datasheets, standards, URLs)
are not checked here: open them.

Every successful lookup is remembered in `cite_check.json` beside the file
checked (commit it with the README). When a later session's proxy refuses the
registries, an id found there prints `ok*` with the date a live lookup last
confirmed it, instead of SKIP, so a blocked session can still tell a checked
citation from an unchecked one (13 run records from 2026-11-10/11 report doi.org or
arXiv refused and re-verified ids by hand). Only this script writes the file;
a 404 removes the entry. `--no-write` leaves it untouched.
"""
import datetime
import os
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

# Balanced "(...)" and "<...>" groups belong to the DOI (10.1016/0021-9991(79)90145-1,
# 10.1175/1520-0485(1999)029<0000:TEOTAO>2.0.CO;2); a bare ")" or ">" ends it, and so does a ";" not followed by a word character.
DOI = re.compile(r"\b(10\.\d{4,9}/(?:\([^\s()]*\)|<[^\s<>]*>|;(?=\w)|[^\s\"<>()\]}|,;])*(?:\([^\s()]*\)|<[^\s<>]*>|[^\s\"<>()\]}|,;.:]))")
# BibTeX "eprint = {2510.04354}" counts as well as "arXiv:2510.04354".
ARXIV = re.compile(r"(?i)(?:\barxiv(?:\.org/abs)?[:/ ]\s*|\beprint\s*=\s*[{\"]\s*)(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?")


def extract(text):
    """(dois, arxiv_ids) in order of first appearance, deduplicated."""
    def uniq(items):
        return list(dict.fromkeys(items))
    return uniq(DOI.findall(text)), uniq(ARXIV.findall(text))


RETRY_CODES = (429, 503)
BACKOFF = (2, 5, 12)  # seconds before each retry; Crossref 429s clear within a few seconds


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "oss-monorepo-cite-check (research)"})
    for delay in (*BACKOFF, None):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code not in RETRY_CODES or delay is None:
                raise
            time.sleep(delay)


def lookup_datacite(doi):
    """DataCite registers datasets and Figshare/Zenodo DOIs that Crossref answers 404 for."""
    a = json.loads(_get("https://api.datacite.org/dois/" + urllib.parse.quote(doi)))["data"]["attributes"]
    return f"{((a.get('titles') or [{}])[0]).get('title', '?')} ({a.get('publicationYear')})"


def lookup_doi(doi):
    try:
        data = json.loads(_get("https://api.crossref.org/works/" + urllib.parse.quote(doi)))["message"]
    except urllib.error.HTTPError as e:
        if e.code != 404:
            raise
        return lookup_datacite(doi)  # still 404 there means no such DOI
    year = ((data.get("issued") or {}).get("date-parts") or [[None]])[0][0]
    return f"{(data.get('title') or ['?'])[0]} ({year})"


def lookup_arxiv(aid):
    feed = _get("https://export.arxiv.org/api/query?id_list=" + urllib.parse.quote(aid))
    entry = feed.split("<entry>", 1)
    if len(entry) < 2 or "<title>Error</title>" in entry[1]:
        raise ValueError("no such arXiv id")
    title = re.search(r"<title>(.*?)</title>", entry[1], re.S).group(1)
    year = re.search(r"<published>(\d{4})", entry[1])
    return f"{' '.join(title.split())} ({year.group(1) if year else '?'})"


CACHE_NAME = "cite_check.json"


def cache_path(path):
    return os.path.join(os.path.dirname(os.path.abspath(path)), CACHE_NAME)


def load_cache(cpath):
    try:
        with open(cpath, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cache(cpath, cache):
    with open(cpath, "w", encoding="utf-8") as f:
        json.dump(cache, f, indent=1, sort_keys=True, ensure_ascii=False)  # one id per line: parallel edits merge
        f.write("\n")


def main(argv):
    offline = "--offline" in argv
    write = "--no-write" not in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    bad = blocked = cached = 0
    today = datetime.date.today().isoformat()
    for path in paths:
        dois, arxivs = extract(open(path, encoding="utf-8").read())
        print(f"{path}: {len(dois)} DOI(s), {len(arxivs)} arXiv id(s)")
        cpath = cache_path(path)
        cache = load_cache(cpath)
        before = json.dumps(cache, sort_keys=True)
        for kind, ids, fn in (("doi", dois, lookup_doi), ("arxiv", arxivs, lookup_arxiv)):
            for i in ids:
                key = f"{kind}:{i}"
                if offline:
                    print(f"  {key}")
                    continue
                reason = None
                try:
                    found = fn(i)
                    print(f"  ok   {key}  {found}")
                    if (cache.get(key) or {}).get("title") != found:
                        cache[key] = {"title": found, "checked": today}
                except urllib.error.HTTPError as e:
                    if e.code == 404:  # the registry answered: no such id
                        bad += 1
                        cache.pop(key, None)
                        print(f"  FAIL {key}  not found (404)")
                    else:  # proxy block, rate limit or outage: says nothing about the id
                        reason = f"HTTP {e.code}"
                except (urllib.error.URLError, OSError) as e:  # no answer at all (proxy connect rejected, DNS, timeout)
                    reason = str(e)
                except (ValueError, KeyError) as e:  # the registry answered with no such record
                    bad += 1
                    cache.pop(key, None)
                    print(f"  FAIL {key}  {e}")
                if reason is None:
                    continue
                hit = cache.get(key)
                if hit:
                    cached += 1
                    print(f"  ok*  {key}  {hit['title']}  (host unreachable now; a live lookup confirmed it on {hit['checked']})")
                else:
                    blocked += 1
                    print(f"  SKIP {key}  host unreachable ({reason}); open the source and say so in the README")
        if write and not offline and json.dumps(cache, sort_keys=True) != before:
            save_cache(cpath, cache)
            print(f"  (updated {os.path.relpath(cpath)}: commit it with the README)")
    if cached:
        print(f"{cached} id(s) marked ok* were confirmed by an earlier live lookup ({CACHE_NAME}), not this run.")
    if blocked:
        print(f"{blocked} id(s) could not be checked because the host refused the lookup (not a verdict on the id).")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
