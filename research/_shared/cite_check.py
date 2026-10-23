#!/usr/bin/env python3
"""Check the DOIs and arXiv ids a research README cites.

    python3 research/_shared/cite_check.py research/<slug>/README.md [more files]
    python3 research/_shared/cite_check.py --offline README.md   # list ids only

Each identifier is looked up (Crossref for DOIs, the arXiv API for arXiv ids)
and printed with the title and year the registry holds, so you can compare it
with what the README claims the source says. A lookup that fails exits 1:
the id is mistyped, invented, or the host is unreachable (say which in the
README). Citations without a DOI or arXiv id (datasheets, standards, URLs)
are not checked here: open them.
"""
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

DOI = re.compile(r"\b(10\.\d{4,9}/[^\s\"<>\])}|,;]+[^\s\"<>\])}|,;.:])")
ARXIV = re.compile(r"(?i)\barxiv(?:\.org/abs)?[:/ ]\s*(\d{4}\.\d{4,5}|[a-z\-]+(?:\.[A-Z]{2})?/\d{7})(?:v\d+)?")


def extract(text):
    """(dois, arxiv_ids) in order of first appearance, deduplicated."""
    def uniq(items):
        return list(dict.fromkeys(items))
    return uniq(DOI.findall(text)), uniq(ARXIV.findall(text))


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "oss-monorepo-cite-check (research)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def lookup_doi(doi):
    data = json.loads(_get("https://api.crossref.org/works/" + urllib.parse.quote(doi)))["message"]
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
    bad = 0
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
                except (urllib.error.URLError, ValueError, KeyError, OSError) as e:
                    bad += 1
                    print(f"  FAIL {kind}:{i}  {e}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
