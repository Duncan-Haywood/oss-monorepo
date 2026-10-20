"""Timeline of review-track PR merges (UTC hour of day, one row per day); clusters of 2+ within 10 minutes are drawn in red."""
import datetime as D, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from swe_reviewdup import reviews as R

ROOT = os.path.join(here, "..", "..", "..")
log = subprocess.run(["git", "-C", ROOT, "log", "origin/main", "--since=2026-10-13", "--format=" + R.LOG_FORMAT, "--name-only"],
                     capture_output=True, text=True, check=True).stdout
rows = R.review_prs(R.parse_log(log))
dup = {r["pr"] for g in R.clusters(rows, 10) if len(g) > 1 for r in g}
days = sorted({r["time"].astimezone(D.timezone.utc).date() for r in rows})
W, H, L, T = 760, 40 + 34 * len(days), 70, 30
s = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" role="img" aria-label="Review-track pull requests merged, by UTC day and hour; pairs merged within 10 minutes are red">' % (W, H),
     '<style>text{font:12px sans-serif;fill:#444}.g{stroke:#ddd}</style><rect width="100%" height="100%" fill="#fff"/>']
for h in range(0, 25, 4):
    x = L + (W - L - 20) * h / 24
    s.append('<line class="g" x1="%.1f" y1="%d" x2="%.1f" y2="%d"/><text x="%.1f" y="%d" text-anchor="middle">%02d</text>' % (x, T - 6, x, H - 10, x, T - 12, h))
for i, d in enumerate(days):
    y = T + 34 * i + 14
    s.append('<text x="6" y="%d">%s</text>' % (y + 4, d))
    for r in rows:
        t = r["time"].astimezone(D.timezone.utc)
        if t.date() == d:
            x = L + (W - L - 20) * (t.hour + t.minute / 60) / 24
            s.append('<circle cx="%.1f" cy="%d" r="5" fill="%s" fill-opacity=".75"/>' % (x, y, "#c0392b" if r["pr"] in dup else "#2c6fb0"))
s.append('<text x="%d" y="%d" text-anchor="end">UTC hour; red = merged within 10 min of another review PR</text></svg>' % (W - 20, H - 2))
open(os.path.join(here, "reviews_timeline.svg"), "w").write("\n".join(s))
