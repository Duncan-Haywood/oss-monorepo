"""Find citations that a research README itself flags as unverified.

A README line is *flagged* when it says a citation or figure was written from memory or not
re-checked. For each flagged line we pull out author-year references such as
"Han, Mao and Dally (2016)" or "Horowitz (2014)" and group them by work.
Stdlib only; reads README.md files and nothing else.
"""
import re
from collections import defaultdict
from pathlib import Path

FLAG = re.compile(
    r"from memory|not re-?verified|not re-?checked|not re-?read|unverified|not (?:been )?verified"
    r"|not checked here|need(?:s)? to be checked", re.I)
NAME = r"[A-Z][A-Za-z'\-]+"
CITE = re.compile(
    r"(%s(?:,? (?:and |& )?%s)*(?: et al\.?)?)(?:,|\s)*\((\d{4})\)" % (NAME, NAME))
# first words that are prose, not surnames
STOP = {"The", "This", "See", "In", "And", "Not", "Cited", "Citation", "Edition", "Energy"}


def projects(root):
    return sorted(p for p in Path(root).iterdir()
                  if p.is_dir() and not p.name.startswith(("_", ".")) and (p / "README.md").exists())


def flagged_lines(text):
    """Lines (stripped) that carry an unverified-citation marker."""
    return [l.strip() for l in text.splitlines() if FLAG.search(l)]


def cites(line):
    """(authors, year) pairs in a line, with prose lead-in words removed."""
    out = []
    for m in CITE.finditer(line):
        words = m.group(1).replace("&", "and").split()
        while words and words[0] in STOP:
            words.pop(0)
        if words:
            out.append((" ".join(words), m.group(2)))
    return out


def audit(root):
    """Return (n_projects, projects_with_flag, flags_by_project, works) over README files."""
    ps = projects(root)
    flags, works = {}, defaultdict(set)
    for p in ps:
        ls = flagged_lines((p / "README.md").read_text(errors="replace"))
        if ls:
            flags[p.name] = ls
            for l in ls:
                for c in cites(l):
                    works[c].add(p.name)
    return len(ps), flags, works
