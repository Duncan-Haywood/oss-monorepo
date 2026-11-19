"""Re-probe the hosts a programme's notes say the proxy refused.

    python3 research/_shared/stale_hosts.py <slug> [<slug> ...]

A research LOG.md or README.md often records "zenodo.org refused the proxy" or
"gss.norc.org still 403s", and the next run plans around it. Egress is decided per
session, so those notes go stale within hours: seven run records from 2026-11-12 to
2026-11-16 found a host the notes called refused answering at the first probe
(zenodo.org for water-leaks, gss.norc.org for christian-belief-models, the TUM host
for sensing-selfcal twice, huggingface.co, codes.ohio.gov). One reads: "A HOSTS file
for the programme would let pick_track.py probe it instead of runs assuming it is
down." This finds the hosts the prose names next to a refusal and probes each once,
so the note can be checked in seconds rather than trusted. pick_track.py prints the
same lines for the programme it draws.

research/<slug>/HOSTS still lists the hosts a programme cannot run without; those
are probed by pick_track.py's OFFLINE check and skipped here. Standard library only.
"""
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlparse

RESEARCH = Path(__file__).resolve().parent.parent

REFUSAL = re.compile(
    r"refus|\b403\b|\bblocked\b|unreachable|not reachable|out of reach|could not reach|"
    r"couldn't reach|denied|no egress|proxy (?:block|reject)", re.I)
DOMAIN = re.compile(
    r"(?<![\w@/.-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+"
    r"(?:org|gov|com|net|edu|io|co|de|uk|fr|eu|ch|nl|int|info|ai|dev|app|jp|ca|au))\b(?![\w-])", re.I)
# Hosts the prose names without a dot ("arXiv refused earlier sessions").
ALIASES = {"arxiv": "arxiv.org", "zenodo": "zenodo.org", "huggingface": "huggingface.co",
           "figshare": "figshare.com", "kaggle": "www.kaggle.com", "pypi": "pypi.org"}
ALIAS = re.compile(r"\b(" + "|".join(ALIASES) + r")\b(?!\.)", re.I)
# Not data hosts: names of files and the repository's own site.
SKIP = re.compile(r"\.(?:py|md|json|csv|txt|inp|io\.github)$|^(?:marisstella\.app|localhost)$", re.I)
NOTES = ("LOG.md", "README.md")
CODE_DIRS = ("src", "experiments")
URL = re.compile(r"https?://([a-z0-9.-]+)", re.I)


def code_hosts(slug, root=RESEARCH):
    """Hosts named in URL literals in the programme's own .py files (src/, experiments/, top level).

    Friction 2026-11-19: the draw sent a run to water-leaks while this note's own recheck said
    "still refused here: zenodo.org"; its data.py fetches two files from Zenodo that no mirror
    carries, but the programme had no HOSTS file, so the OFFLINE check never probed it."""
    d = root / slug
    files = list(d.glob("*.py"))
    for sub in CODE_DIRS:
        if (d / sub).is_dir():
            files += [f for f in (d / sub).rglob("*.py") if ".venv" not in f.parts]
    found = set()
    for f in files:
        try:
            found |= {m.group(1).lower().rstrip(".") for m in URL.finditer(f.read_text(errors="replace"))}
        except OSError:
            pass
    return found


def clauses(line):
    """A line split at sentence and clause ends, so 'arXiv refused earlier; Zenodo answered'
    pairs the refusal with arXiv only."""
    return re.split(r"(?<=[.;!?])\s+|\s+&mdash;\s+|\s+—\s+", line)


def refused_mentions(text):
    """{host: first line number} for hosts named in a clause that also says refused / 403 / blocked."""
    found = {}
    for no, line in enumerate(text.splitlines(), 1):
        if not REFUSAL.search(line):
            continue
        for clause in clauses(line):
            if not REFUSAL.search(clause):
                continue
            hosts = [m.group(1).lower() for m in DOMAIN.finditer(clause)]
            hosts += [ALIASES[m.group(1).lower()] for m in ALIAS.finditer(clause)]
            for h in hosts:
                if not SKIP.search(h):
                    found.setdefault(h, no)
    return found


def noted_hosts(slug, root=RESEARCH):
    """[(host, 'FILE:line')] from the programme's LOG.md and README.md, minus its HOSTS entries."""
    d = root / slug
    listed = set()
    hosts_file = d / "HOSTS"
    if hosts_file.is_file():
        for l in hosts_file.read_text().splitlines():
            entry = l.split("#", 1)[0].strip()
            if entry:
                listed.add((urlparse(entry).hostname if "//" in entry else entry.split("/")[0]).lower())
    out = {}
    for name in NOTES:  # LOG.md first, newest entry first (it is written newest at the top)
        f = d / name
        if f.is_file():
            for h, no in refused_mentions(f.read_text(errors="replace")).items():
                if h not in listed:
                    out.setdefault(h, f"{name}:{no}")
    return sorted(out.items(), key=lambda x: (NOTES.index(x[1].split(":")[0]), int(x[1].split(":")[1])))


def recheck_lines(slug, answers=None, limit=8, root=RESEARCH):
    """Lines saying which noted-refused hosts answer now and which still do not ([] when none are noted)."""
    if answers is None:
        from pick_track import host_answers as answers  # one probe cache with the OFFLINE check
    noted = noted_hosts(slug, root)[:limit]
    if not noted:
        return []
    with ThreadPoolExecutor(max_workers=len(noted)) as ex:
        ok = list(ex.map(lambda h: answers("https://" + h[0] + "/"), noted))
    up = [f"{h} ({where})" for (h, where), a in zip(noted, ok) if a]
    down = [h for (h, _), a in zip(noted, ok) if not a]
    lines = []
    if up:
        lines.append(f"HOSTS RECHECK {slug}: notes call these refused, but the proxy passes them now "
                     f"(probe the path you need before routing around them): {', '.join(up)}")
    if down:
        lines.append(f"HOSTS RECHECK {slug}: still refused here: {', '.join(down)}")
        fetched = sorted(h for h in down if h in code_hosts(slug, root))
        if fetched:
            lines.append(f"HOSTS RECHECK {slug}: its own code fetches from {', '.join(fetched)}; if a next step "
                         f"cannot run without it, list it in research/{slug}/HOSTS so the draw skips this "
                         "programme while it is refused (and pick another now)")
    return lines


if __name__ == "__main__":
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    slugs = [a.strip("/").removeprefix("research/") for a in sys.argv[1:]]
    if not slugs or slugs[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if slugs else 2)
    for s in slugs:
        if not (RESEARCH / s).is_dir():
            sys.exit(f"no such programme: research/{s}")
        print("\n".join(recheck_lines(s)) or f"{s}: its LOG.md and README.md name no refused host")
