"""Regenerate the committed step-2 sample alert.

    python3 render_change_alert_sample.py

Writes ``sample-change-alert-2026-08-24.md`` next to this file. CI does
not run this; ``test_change_alert.SamplePinned`` re-renders the same
inputs and fails if the committed file has drifted.
"""

from __future__ import annotations

from pathlib import Path

import change_alert as ca

HERE = Path(__file__).resolve().parent
FIXTURE = HERE / "fixtures" / "kev-change-log4j.json"
SAMPLE = HERE / "sample-change-alert-2026-08-24.md"
CVE = "CVE-2021-44228"
GENERATED_AT = "2026-08-24T00:00:00Z"


def main() -> None:
    SAMPLE.write_text(ca.render_from_path(str(FIXTURE), CVE, GENERATED_AT))


if __name__ == "__main__":
    main()
