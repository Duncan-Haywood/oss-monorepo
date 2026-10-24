import collections, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(here, "..", "src"))
from swe_reviewdup import reviews as R

ROOT = os.path.join(here, "..", "..", "..")
if subprocess.run(["git", "-C", ROOT, "rev-parse", "--is-shallow-repository"], capture_output=True, text=True).stdout.strip() == "true":
    sys.exit("shallow clone: run `git fetch --unshallow origin main` first")
log = subprocess.run(["git", "-C", ROOT, "log", "origin/main", "--since=2026-10-13", "--format=" + R.LOG_FORMAT, "--name-only"],
                     capture_output=True, text=True, check=True).stdout
commits = R.parse_log(log)
rows = R.review_prs(commits)
by_pr = R.load_records(os.path.join(ROOT, "prompts", "runs"))
print("commits on origin/main since 2026-10-13: %d; review-track PRs: %d (%s to %s)"
      % (len(commits), len(rows), rows[0]["time"].date(), rows[-1]["time"].date()))

print("\n== clusters by window (minutes): clusters, PRs in clusters of 2+, extra PRs beyond one per cluster")
for w in (2, 5, 10, 30, 60):
    g = R.clusters(rows, w)
    multi = [x for x in g if len(x) > 1]
    extra = sum(len(x) - 1 for x in multi)
    print("%3d  %2d clusters, %2d PRs in %2d clusters of 2+, %2d extra  (extra share %.1f%%, Wilson %.1f-%.1f%%)"
          % (w, len(g), sum(len(x) for x in multi), len(multi), extra, 100 * extra / len(rows),
             100 * R.wilson(extra, len(rows))[0], 100 * R.wilson(extra, len(rows))[1]))

W = 10
g = R.clusters(rows, W)
print("\n== window %d min: every cluster of 2+ (merge times as committed; files changed outside prompts/runs/ shared by 2+ PRs)" % W)
for x in g:
    if len(x) > 1:
        print("%s  PRs %s  gap %.1f min  shared files: %s" % (
            x[0]["time"].strftime("%m-%d %H:%M%z"), ",".join("#%d" % r["pr"] for r in x),
            (x[-1]["time"] - x[0]["time"]).total_seconds() / 60,
            ", ".join(R.shared_files(x)) or "none"))

print("\n== what the duplicate PRs edited (window %d min): extra PRs only, files outside prompts/runs/" % W)
extra_rows = [r for x in g for r in x[1:]]
c = collections.Counter(f for r in extra_rows for f in r["changed"])
print("extra PRs: %d, of which with no file outside prompts/runs/: %d" % (len(extra_rows), sum(1 for r in extra_rows if not r["changed"])))
for f, n in c.most_common(8):
    print("  %2d  %s" % (n, f))

print("\n== recorded cost (cost_usd on the run record naming the PR)")
def cost(rs):
    v = [by_pr[r["pr"]].get("cost_usd") for r in rs if r["pr"] in by_pr]
    v = [x for x in v if isinstance(x, (int, float))]
    return len(v), sum(v)
n_all, c_all = cost(rows)
n_x, c_x = cost(extra_rows)
print("review PRs with a priced record: %d of %d, total $%.2f" % (n_all, len(rows), c_all))
print("extra (duplicate) PRs with a priced record: %d of %d, total $%.2f" % (n_x, len(extra_rows), c_x))

print("\n== reviews per day (distinct clusters at %d min / PRs)" % W)
days = collections.defaultdict(lambda: [0, 0])
for x in g:
    d = x[0]["time"].astimezone().date() if False else x[0]["time"].astimezone(__import__("datetime").timezone.utc).date()
    days[d][0] += 1
    days[d][1] += len(x)
for d in sorted(days):
    print(d, days[d][0], days[d][1])
gaps = [(b[0]["time"] - a[-1]["time"]).total_seconds() / 3600 for a, b in zip(g, g[1:])]
gaps.sort()
print("hours between distinct review clusters: n=%d min %.1f median %.1f max %.1f" % (len(gaps), gaps[0], gaps[len(gaps) // 2], gaps[-1]))
