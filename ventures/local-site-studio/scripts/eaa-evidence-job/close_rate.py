"""First-experiment close-rate on this venture's own delivered pages.

The pipeline candidate's first experiment asks how many blocking issues a
generated fix pass closes on three real shop themes, under assistive-
technology verification. Live shops and a contractor are still
owner-gated. This script is the software half that can run here:

- take three committed category themes this venture already delivers
  (trades, salon, restaurant)
- confirm the unmodified pages have no findings the probe can see
- apply only the rewriteable defect classes the mechanical pass is
  allowed to close (title, heading skip, zoom-lock, aria-hidden on a
  named control, unmuted autoplay, orientation-lock rotate)
- re-audit with the same engine

A 1.0 close rate on those injected findings is not the kill-criterion
number. It is the rate on defects the pass was written to close, placed
onto real theme markup. The probe's synthetic shop fixtures already
measured 1/11 blocking closed when the defects are mostly missing words.
Both figures are required to read this honestly.

Does not invent alt text, labels, captions, link names, button names, or
a page language. Does not claim AT verification. Does not claim
compliance. Checkout is not involved.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
PROBE_SRC = REPO / "portfolio" / "pipeline" / "probes" / "eaa-wcag-triage" / "src"
CORPUS = REPO / "portfolio" / "research" / "a11y-generated-sites" / "corpus"
RESULTS = Path(__file__).resolve().parent / "results-2026-08-24.json"

if str(PROBE_SRC) not in sys.path:
    sys.path.insert(0, str(PROBE_SRC))

from wcag_triage.engine import audit_html  # noqa: E402
from wcag_triage.mechanical_fix import (  # noqa: E402
    apply_mechanical_fixes,
    summarise_close_rate,
)

PAGES = (
    "live-trades.html",
    "live-salon.html",
    "live-restaurant.html",
)

LIMITS = (
    "Host-venture delivered pages, not a live customer shop.",
    "Re-audit by the same static engine, not assistive-technology verification.",
    "Does not settle the candidate's kill criterion (that needs live themes "
    "and a contractor).",
    "Mutated close-rate injects only the rewriteable defect classes the "
    "pass can close. It is not a shop's natural blocking mix.",
    "Does not invent alt text, labels, captions, link names, button names, "
    "or a page language.",
    "Unmodified pages of this corpus were already measured clean; a null "
    "unmodified close-rate is that measurement, not a missing run.",
)


def load_page(name: str) -> str:
    path = CORPUS / name
    if not path.is_file():
        raise FileNotFoundError(path)
    return path.read_text(encoding="utf-8")


def apply_mechanical_defects(html: str) -> str:
    """Place only rewriteable defects onto already-delivered markup."""
    html = re.sub(r"<title>.*?</title>", "", html, count=1, flags=re.S)
    html = re.sub(r"<h2\b", "<h4", html, count=1)
    html = re.sub(r"</h2>", "</h4>", html, count=1)
    html = re.sub(
        r"<head>",
        (
            '<head><meta name="viewport" content="width=device-width, '
            'maximum-scale=1, user-scalable=no"/>'
            "<style>@media (orientation: portrait) { "
            "html { transform: rotate(90deg); } }</style>"
        ),
        html,
        count=1,
    )
    html = re.sub(r"<button\b", '<button aria-hidden="true"', html, count=1)
    html = re.sub(
        r"(<body\b[^>]*>)",
        r'\1<audio autoplay src="close-rate-probe.mp3"></audio>',
        html,
        count=1,
        flags=re.I,
    )
    return html


def measure() -> dict:
    unmodified_counts = []
    mutated_passes = []
    for name in PAGES:
        raw = load_page(name)
        clean = audit_html(raw).counts()
        unmodified_counts.append({"page": name, **clean})
        mutated_passes.append(apply_mechanical_fixes(apply_mechanical_defects(raw)))

    mutated = summarise_close_rate(mutated_passes, list(PAGES))
    mutated["limits"] = list(LIMITS)
    unmodified_blocking = sum(row["blocking"] for row in unmodified_counts)
    return {
        "measured": "2026-08-24",
        "corpus": "portfolio/research/a11y-generated-sites/corpus",
        "pages": list(PAGES),
        "unmodified": {
            "pages": unmodified_counts,
            "blocking": unmodified_blocking,
            "blocking_close_rate": None,
        },
        "mutated_mechanical_only": mutated,
        "limits": list(LIMITS),
    }


def write_results(path: Path = RESULTS) -> dict:
    report = measure()
    path.write_text(
        json.dumps(report, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return report


def main() -> int:
    report = write_results()
    mutated = report["mutated_mechanical_only"]
    print(
        "unmodified blocking: {0}; mutated blocking close-rate: {1}".format(
            report["unmodified"]["blocking"],
            mutated["blocking_close_rate"],
        )
    )
    print("wrote", RESULTS)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
