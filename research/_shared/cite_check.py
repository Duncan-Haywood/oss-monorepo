#!/usr/bin/env python3
"""Check the DOIs and arXiv ids a research README cites.

    python3 research/_shared/cite_check.py research/<slug>/README.md [more files]
    python3 research/_shared/cite_check.py --offline README.md   # list ids only

Each identifier is looked up (Crossref for DOIs, DataCite when Crossref has no such DOI, the arXiv API for arXiv ids)
and printed with the title and year the registry holds, so you can compare it
with what the README claims the source says. A lookup that fails exits 1:
the id is mistyped or invented. A host that refuses the lookup (403, 429, 5xx,
as the cloud proxy sometimes does) prints SKIP and does not fail the run;
open the source by hand and say in the README that it was not machine-checked. Citations without a DOI or arXiv id (datasheets, standards, URLs)
are not checked here: open them.
"""
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

# Balanced "(...)" groups belong to the DOI (10.1016/0021-9991(79)90145-1); a bare ")" ends it.
DOI = re.compile(r"\b(10\.\d{4,9}/(?:\([^\s()]*\)|[^\s\"<>()\]}|,;])*(?:\([^\s()]*\)|[^\s\"<>()\]}|,;.:]))")
# BibTeX "eprint = {2510.04354}" counts as well as "arXiv:2510.04354".
ARXIV = re.compile(r"(?i)(?:\barxiv(?:\.org/abs)?[:/ ]\s*|\beprint\s*=\s*[{\"]\s*)(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?")


def extract(text):
    """(dois, arxiv_ids) in order of first appearance, deduplicated."""
    def uniq(items):
        return list(dict.fromkeys(items))
    return uniq(DOI.findall(text)), uniq(ARXIV.findall(text))


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "oss-monorepo-cite-check (research)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


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


def main(argv):
    offline = "--offline" in argv
    paths = [a for a in argv if not a.startswith("--")]
    if not paths:
        print(__doc__)
        return 2
    bad = blocked = 0
    for path in paths:
        dois, arxivs = extract(open(path, encoding="utf-8").read())
        print(f"{path}: {len(dois)} DOI(s), {len(arxivs)} arXiv id(s)")
        for kind, ids, fn in (("doi", dois, lookup_doi), ("arxiv", arxivs, lookup_arxiv)):
            for i in ids:
                if offline:
                    print(f"  {kind}:{i}")
                    continue
                try:
                    print(f"  ok   {kind}:{i}  {fn(i)}")
                except urllib.error.HTTPError as e:
                    if e.code == 404:  # the registry answered: no such id
                        bad += 1
                        print(f"  FAIL {kind}:{i}  not found (404)")
                    else:  # proxy block, rate limit or outage: says nothing about the id
                        blocked += 1
                        print(f"  SKIP {kind}:{i}  host unreachable (HTTP {e.code}); open the source and say so in the README")
                except (urllib.error.URLError, ValueError, KeyError, OSError) as e:
                    bad += 1
                    print(f"  FAIL {kind}:{i}  {e}")
    if blocked:
        print(f"{blocked} id(s) could not be checked because the host refused the lookup (not a verdict on the id).")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
