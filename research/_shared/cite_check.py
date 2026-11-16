#!/usr/bin/env python3
"""Check the DOIs and arXiv ids a research README cites.

    python3 research/_shared/cite_check.py research/<slug>/README.md [more files]
    python3 research/_shared/cite_check.py --offline README.md   # list ids only
    python3 research/_shared/cite_check.py --no-write README.md  # do not update cite_check.json
    python3 research/_shared/cite_check.py hand README.md doi:10.x/y "Title (2019)" "<where you checked it>"

Each identifier is looked up (Crossref for DOIs, DataCite when Crossref has no such DOI, the arXiv API for arXiv ids)
and printed with the title and year the registry holds, so you can compare it
with what the README claims the source says. A lookup that fails exits 1:
the id is mistyped or invented. A host that refuses the lookup (403, 429, 5xx,
as the cloud proxy sometimes does) or a connection that never completes
(proxy connect rejected, DNS, timeout) prints SKIP and does not fail the run;
open the source by hand and say in the README that it was not machine-checked.

Before printing SKIP, a refused lookup is retried against OpenAlex
(api.openalex.org), which indexes Crossref and DataCite DOIs and arXiv ids (as
10.48550/arXiv.<id>). A hit prints `ok~` with OpenAlex's title and year and
counts as checked; OpenAlex may list the journal version of an arXiv paper, so
its year can be later. OpenAlex not knowing an id is not a verdict (its
coverage is incomplete): that still falls through to `ok*` or SKIP. Run records
to 2026-11-15 name doi.org, Crossref or arXiv as refused about 60 times across
246 cite_check runs, while OpenAlex was reachable in sessions that tested it. Citations without a DOI or arXiv id (datasheets, standards, URLs)
are not checked here: open them.

Every successful lookup is remembered in `cite_check.json` beside the file
checked (commit it with the README). When a later session's proxy refuses the
registries, an id found there prints `ok*` with the date a live lookup last
confirmed it, instead of SKIP, so a blocked session can still tell a checked
citation from an unchecked one (13 run records from 2026-11-10/11 report doi.org or
arXiv refused and re-verified ids by hand). Only this script writes the file;
a 404 removes the entry. `--no-write` leaves it untouched.

A file outside any `research/<slug>/` (a blog post) writes no cache; it
reads every project's `cite_check.json` instead, so an id a README confirmed
prints `ok*` for the post. A directory argument checks its README, PROPOSAL and
whitepaper (or every top-level .md when it has none of those).

A file below its project root (`research/<slug>/paper/draft.md`) also reads the
`cite_check.json` files of the directories above it, up to `research/<slug>/`,
so ids confirmed for the README still print `ok*` for the paper (friction
2026-11-12). New lookups are written beside the file checked, as before.

When every registry refuses, runs check an id by hand (web search, the
publisher's page, an upstream README) and the result used to be lost: on
2026-11-15, 310 of the 414 DOIs and arXiv ids cited in 216 research READMEs
had never been confirmed live, so they printed SKIP in every blocked session
and each one re-checked them. `hand` records such a check with the title and
year you saw and where you saw it (`"via": "hand"` plus `source`). A blocked
session then prints `ok?` with that date and source: a person checked it, no
registry has. It is kept apart from `ok` and `ok*` so a hand check never reads
as a machine one. A later live lookup replaces it, and a 404 removes it. Only
ids the file cites can be recorded, and a live entry is never overwritten.
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


def lookup_openalex(kind, i):
    """Fallback when the primary registry refuses: OpenAlex by DOI (arXiv ids by their DataCite DOI)."""
    doi = i if kind == "doi" else "10.48550/arXiv." + i
    w = json.loads(_get("https://api.openalex.org/works/doi:" + urllib.parse.quote(doi, safe="/:.")))
    if not w.get("title"):
        raise ValueError("OpenAlex record has no title")
    return f"{w['title']} ({w.get('publication_year')})"


CACHE_NAME = "cite_check.json"


def cache_path(path):
    return os.path.join(os.path.dirname(os.path.abspath(path)), CACHE_NAME)


def ancestor_caches(path):
    """cite_check.json paths above the file's own directory, nearest first, stopping
    at the project root (a directory whose parent is named `research`) or a `.git`."""
    d = os.path.dirname(os.path.abspath(path))
    out = []
    while True:
        parent = os.path.dirname(d)
        if parent == d or os.path.basename(parent) == "research" or os.path.exists(os.path.join(d, ".git")):
            return out
        d = parent
        out.append(os.path.join(d, CACHE_NAME))


def project_root(path):
    """The `research/<slug>/` directory holding `path`, or None when it is outside one."""
    d = os.path.dirname(os.path.abspath(path))
    while True:
        parent = os.path.dirname(d)
        if parent == d:
            return None
        if os.path.basename(parent) == "research" and not os.path.basename(d).startswith(("_", ".")):
            return d
        d = parent


def research_caches(path):
    """Every `research/*/cite_check.json` in the checkout holding `path` (found by walking up to
    a directory with a `research/` beside a `.git`), for a file outside any project."""
    d = os.path.dirname(os.path.abspath(path))
    while True:
        if os.path.isdir(os.path.join(d, "research")) and os.path.exists(os.path.join(d, ".git")):
            r = os.path.join(d, "research")
            return sorted(os.path.join(r, s, CACHE_NAME) for s in os.listdir(r)
                          if os.path.isfile(os.path.join(r, s, CACHE_NAME)))
        parent = os.path.dirname(d)
        if parent == d:
            return []
        d = parent


DIR_FILES = ("README.md", "PROPOSAL.md", "whitepaper.md", "WHITEPAPER.md")


def expand(paths):
    """A directory stands for the documents a project cites from: its README, proposal and
    whitepaper, or every top-level .md when it has none of those (friction 2026-11-16: a
    project directory crashed with IsADirectoryError)."""
    out = []
    for p in paths:
        if not os.path.isdir(p):
            out.append(p)
            continue
        found = [os.path.join(p, n) for n in DIR_FILES if os.path.isfile(os.path.join(p, n))]
        if not found:
            found = sorted(os.path.join(p, n) for n in os.listdir(p) if n.endswith(".md"))
        print(f"{p} is a directory: checking {', '.join(os.path.basename(f) for f in found) or 'nothing (no .md files)'}")
        out.extend(found)
    return out


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


def record_hand(path, key, title, source, today=None):
    """Record a hand check of `key` (an id `path` cites) in its cite_check.json; returns (exit code, message)."""
    kind, _, i = key.partition(":")
    dois, arxivs = extract(open(path, encoding="utf-8").read())
    if kind not in ("doi", "arxiv") or i not in (dois if kind == "doi" else arxivs):
        cited = [f"doi:{d}" for d in dois] + [f"arxiv:{a}" for a in arxivs]
        return 2, f"{key} is not cited in {path}; it cites: {', '.join(cited) or 'no DOI or arXiv id'}"
    if project_root(path) is None:
        return 2, (f"{path} is outside research/<slug>/, so a hand check would land in an untracked cache: "
                   "record it against the project README that cites the same id")
    if not title.strip() or not source.strip():
        return 2, "give the title (year) you saw and where you saw it (a URL or the document)"
    cpath = cache_path(path)
    cache = load_cache(cpath)
    old = cache.get(key) or {}
    if old and old.get("via") != "hand":
        return 0, f"{key} already confirmed by a lookup on {old.get('checked')} ({old.get('title')}): kept"
    cache[key] = {"title": title.strip(), "checked": today or datetime.date.today().isoformat(),
                  "via": "hand", "source": source.strip()}
    save_cache(cpath, cache)
    return 0, f"recorded {key} as hand-checked in {os.path.relpath(cpath)}: commit it with the README"


def main(argv):
    if argv[:1] == ["hand"]:
        if len(argv) != 5:
            print('usage: cite_check.py hand FILE doi:<id>|arxiv:<id> "Title (year)" "<where you checked it>"')
            return 2
        rc, msg = record_hand(*argv[1:])
        print(msg)
        return rc
    offline = "--offline" in argv
    write = "--no-write" not in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    missing = [p for p in paths if not os.path.exists(p)]
    if missing:
        print(f"no such file: {', '.join(missing)}")
        return 2
    paths = expand(paths)
    bad = blocked = cached = rescued = handed = 0
    today = datetime.date.today().isoformat()
    for path in paths:
        dois, arxivs = extract(open(path, encoding="utf-8").read())
        print(f"{path}: {len(dois)} DOI(s), {len(arxivs)} arXiv id(s)")
        in_project = project_root(path) is not None
        cpath = cache_path(path)
        cache = load_cache(cpath)
        before = json.dumps(cache, sort_keys=True)
        # A file outside research/<slug>/ (a blog post in docs/posts/) keeps no cache of its own:
        # one written there was an untracked file nobody knew whether to commit (friction
        # 2026-11-16). It reads every project's cache instead, so an id a README confirmed
        # still prints ok* for the post.
        inherited = [load_cache(c) for c in (ancestor_caches(path) if in_project else research_caches(path))]
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
                    if (cache.get(key) or {}).get("title") != found or "via" in (cache.get(key) or {}):
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
                try:
                    found = lookup_openalex(kind, i)
                except (urllib.error.URLError, OSError, ValueError, KeyError):
                    found = None  # refused too, or OpenAlex lacks it: not a verdict on the id
                if found:
                    rescued += 1
                    print(f"  ok~  {key}  {found}  (primary registry unreachable: {reason}; found via OpenAlex)")
                    if (cache.get(key) or {}).get("title") != found or (cache.get(key) or {}).get("via") == "hand":
                        cache[key] = {"title": found, "checked": today, "via": "openalex"}
                    continue
                hit = cache.get(key) or next((c[key] for c in inherited if key in c), None)
                if hit and hit.get("via") == "hand":
                    handed += 1
                    print(f"  ok?  {key}  {hit['title']}  (host unreachable; checked by hand on {hit['checked']} "
                          f"against {hit.get('source', '?')}, never by a registry)")
                elif hit:
                    cached += 1
                    print(f"  ok*  {key}  {hit['title']}  (host unreachable now; a live lookup confirmed it on {hit['checked']})")
                else:
                    blocked += 1
                    print(f"  SKIP {key}  host unreachable ({reason}); open the source, then record it: "
                          f"cite_check.py hand {path} {key} \"<title (year)>\" \"<where>\"")
        if not in_project:
            if not offline:
                print("  (outside research/<slug>/: lookups not cached; nothing to commit)")
        elif write and not offline and json.dumps(cache, sort_keys=True) != before:
            save_cache(cpath, cache)
            print(f"  (updated {os.path.relpath(cpath)}: commit it with the README)")
    if rescued:
        print(f"{rescued} id(s) marked ok~ were confirmed live via OpenAlex because the primary registry refused the lookup.")
    if cached:
        print(f"{cached} id(s) marked ok* were confirmed by an earlier live lookup ({CACHE_NAME}), not this run.")
    if handed:
        print(f"{handed} id(s) marked ok? were checked by hand in an earlier session, never by a registry.")
    if blocked:
        print(f"{blocked} id(s) could not be checked because the host refused the lookup (not a verdict on the id).")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
