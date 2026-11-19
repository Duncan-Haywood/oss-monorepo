"""Session 87: boosting rounds of the borrowed (transfer) model under each early-stopping variant, on the same cells.

Session 86 found the deployable model's loss sits in how many rounds its 0.9-quantile model gets, but sessions 84
and 85 never saved their round counts. This fits only the transfer model (cascade2 class, the selector's default
candidate) under the variants that early-stop, and records the round each quantile stops at:

  full         sources' years <= Y-2, early-stopped on their whole Y-1 (session 84; complete labels, an oracle)
  es_truncate  as full, early-stopped on the Y-1 rows completed by D = 1 January Y (session 85)
  es3          sources' years <= Y-4 and Y-2, early-stopped on their Y-3, all completed by D (session 87)
  cut_only     sources' years <= Y-2 completed by D, early-stopped on their whole Y-1 (session 87, post hoc: the
               training cut of sessions 86 and 87 alone, with session 84's early stopping)
  ipcw_cut     cut_only's training rows weighted by 1/G(y) (transfer.ipcw_completed: G per source city-year from
               its issue days), early-stopped on the whole Y-1 unweighted (session 88: do the weights give back
               what the cut takes?)
  ipcw_es3     es3's rows (train <= Y-4 and Y-2, early-stop Y-3, all completed by D), training and early-stopping
               rows both IPCW-weighted (session 88: the deployable version)
  cens_cut     cut_only's rows plus the sources' permits of years <= Y-2 still open at D, kept as lower bounds
               (transfer.censored_pseudo: Portnoy-style pseudo-rows, quantile level from a Kaplan-Meier per source
               city and class); early-stopped on the whole Y-1 unweighted (session 89)
  cens_es3     es3's rows with the same pseudo-rows for the open permits, in training and early stopping
               (session 89: the deployable version)
  cens_*_cap   as cens_*, the upper pseudo-row at the stratum's longest completed build instead of +infinity
               (session 89, post hoc: censored_pseudo(cap=True))
  cpin_cut     cut_only's rows plus the sources' permits of years <= Y-2 still open at D, each kept as "at least its
               window" in a censored pinball loss (src/cpin.py: custom gradient, leaves renewed to the censored
               loss's minimiser); early-stopped on the whole Y-1, complete labels (session 90)
  cpin_es3     es3's years with the open permits kept the same way, in training and in the Y-3 early-stopping
               set, which is scored by the censored loss (session 90: the deployable version)
  cpin_es3_done  es3's rows (completed by D only) through the same custom loop: checks the loop against es3
  cpin_es3_nc  cpin_es3 with the source permits never completed by the pull put back as open rows (window at D),
               in training and in the Y-3 early-stopping set: a deployment on D sees them open too (session 91)
  cpin_es3_nc5 cpin_es3_nc with a staleness rule a deployment can apply: any source permit open at D for more
               than STALE_DAYS (5 years) is presumed abandoned and dropped (session 91)
  cpin_es3_nc2, _nc3, _nc8  the same rule at 2, 3 and 8 years (session 92's sweep, STALE)
  cpin_es3_nc4, _nc6  the same rule at 4 and 6 years (session 102: is 5 years a plateau?)
  cpin_es3_ncq the same rule with a threshold per source city: its own 0.99 quantile of build days over its
               years <= Y-2 completed by D (session 93, q_threshold)
  cpin_es3_ncr as ncq, the quantile taken only over the source's builds completed in the 3 years before D
               (session 104, recent_threshold: a cut that moves with recent completions)
  cpin_es3_ncr95  as ncr at the 0.95 quantile (session 105: a lower quantile, less moved by rare close-outs)
  cpin_es3_ncrd   as ncr (0.99 quantile, 3 years), after dropping from the quantile's sample every completion on a
               calendar day on which more than BATCH_N permits issued over OLD_DAYS (8 years) earlier were completed
               (session 105, batch_days: batch close-outs of old permits removed before the tail is read)
  cpin_es3_nc5_clean  cpin_es3_nc5 with the source permits completed by D whose close-out status is dead (expired,
               void, withdrawn, ... or Seattle's "Closed as Incomplete" marker; src/status_pull.py) dropped from
               training and early stopping: their completion date is an administrative closure, not a build's
               end (session 95). Dead permits completed after D stay, as open rows: on D nobody knows yet.
  cpin_es3_nc5_stamp  cpin_es3_nc5 with only the dead rows whose completion sits exactly STAMP_DAYS (180) after
               issue dropped: Austin's expiry stamps (session 95's stamp_check), not the other closures (session 96)
  cpin_es3_nc3_clean  cpin_es3_nc5_clean's dead drop on session 92's 3-year staleness cut (session 96)
  cpin_es3_nc5_stamp_len  cpin_es3_nc5_stamp plus, for each source city and each decile bin of the labels of its
               non-stamp dead rows completed by D, as many randomly chosen live (not dead) rows completed by D with
               labels in that bin dropped (len_drop, fixed rng seed LEN_SEED): the length of session 96's dropped
               closures without their class (session 97)
  cpin_es3_nc5_stamp_long  cpin_es3_nc5_stamp plus the non-stamp dead rows completed by D whose label exceeds
               LONG_DAYS (365) dropped: only the long closures (session 97)
Session 98: with CPIN_TARGET_SEL=1 every cpin_es3* variant also predicts the held-out (target) city's own
Y-3 permits, rows a deployment on D = 1 January Y holds: tgt_loss is the q0.9 pinball loss on those completed by D,
tgt_closs the censored loss on all of them (open ones with their window at D). target_sel_summary picks, per cell,
the candidate source rule with the lowest tgt_loss (and, as a second selector, tgt_closs) and scores the pick on
the test year against each fixed rule and the per-cell oracle. The target's rows are never trained on.
Session 101: with CPIN_ROWS_DIR=DIR every cpin variant also writes DIR/<held>_<Y>_<variant>.npz: the q0.9
predictions per seed on the completed test rows and on each target cohort Y-k (with labels, open flags, IPCW
weights), so src/tfol_boot.py can resample rows and say how often the pick flips (paired bootstrap).
Session 95: with --status-dir every cpin variant is also scored on the "live" test rows: completed test-year
rows whose status is not dead (test_loss_live), and reports its mean q0.9 prediction on completed test rows.
Session 92: every _nc variant is also scored on a selection set a deployment has on D, the same for every
threshold: all the sources' Y-3 permits (never-completed ones included, none dropped), open ones with their
window at D, by the censored loss (sel_closs). sweep_summary picks the threshold with the lowest q0.9 sel_closs
per held city-year.
With a frame loaded keep_open (the _nc variants), --score also reports the censored test loss: the held-out
year's never-completed permits enter cpin.closs with their window at the pull date (session 91).

--score also scores cascade2's transfer predictions on the held-out city's test year (all rows; mean
pinball loss over the 3 seeds, as select_deploy's test_loss) and writes results/rounds_score_i2c.json.

Session 86's fixed counts are in its select_deploy_dep_*.json (deploy_detail.cascade2.rounds).
Run: python3.13 src/rounds.py DIR --held austin sf seattle --test-years 2021 2022
     python3.13 src/rounds.py --summarise x   (data_dir unused)
Writes results/rounds_i2c.json and results/rounds_summary.json.
"""
import argparse, datetime, json, os, sys, time
import numpy as np, pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import boosted, transfer  # noqa: E402

VARIANTS = ("full", "es_truncate", "es3", "cut_only", "ipcw_cut", "ipcw_es3", "cens_cut", "cens_es3",
            "cens_cut_cap", "cens_es3_cap", "cpin_cut", "cpin_es3", "cpin_es3_done",
            "cpin_es3_nc", "cpin_es3_nc5", "cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc8", "cpin_es3_ncq",
            "cpin_es3_nc5_clean", "cpin_es3_nc5_stamp", "cpin_es3_nc3_clean",
            "cpin_es3_nc5_stamp_len", "cpin_es3_nc5_stamp_long", "cpin_es3_nc4", "cpin_es3_nc6", "cpin_es3_ncr",
            "cpin_es3_ncr95", "cpin_es3_ncrd")
STALE_DAYS = 1826  # session 91: 5 years; the cpin_es3_nc5 staleness rule (fixed before any run)
# session 92: the staleness threshold swept, in days (2, 3, 5, 8 years; the grid session 91's "Next" named)
STALE = {"cpin_es3_nc2": 730, "cpin_es3_nc3": 1095, "cpin_es3_nc5": STALE_DAYS, "cpin_es3_nc8": 2922,
         "cpin_es3_nc5_clean": STALE_DAYS, "cpin_es3_nc5_stamp": STALE_DAYS, "cpin_es3_nc3_clean": 1095,
         "cpin_es3_nc5_stamp_len": STALE_DAYS, "cpin_es3_nc5_stamp_long": STALE_DAYS,
         "cpin_es3_nc4": 1461, "cpin_es3_nc6": 2191}  # session 102: the finer grid session 101 named (4, 6 years)
STAMP_DAYS = 180  # session 96: the label 96% of Austin's pre-2000 dead completions carry (results/stamp_check.json)
DEAD_DROP = ("cpin_es3_nc5_clean", "cpin_es3_nc5_stamp", "cpin_es3_nc3_clean", "cpin_es3_nc5_stamp_len",
             "cpin_es3_nc5_stamp_long")
LONG_DAYS = 365  # session 97: "long" closures (Austin's dead median 140, p90 1,080 days; label_audit.json)
LEN_SEED = 97  # session 97: rng seed of len_drop's matched sample, fixed before any run
LEN_BINS = 10  # session 97: decile bins of the dead rows' labels
TGT_KS = (3, 5, 6)  # session 99: target cohorts Y-k scored (completed by D, plain and IPCW-weighted)
# session 100: CPIN_TGT_KS=3,5,6,8 adds the Y-8 cohort (default unchanged)
TGT_KS = tuple(int(x) for x in os.environ.get("CPIN_TGT_KS", "").split(",") if x) or TGT_KS
STALE_Q = 0.99  # session 93, cpin_es3_ncq: a source's threshold = this quantile of its builds completed by D


def q_threshold(d, decision, q=STALE_Q):
    """Session 93 (cpin_es3_ncq): the q-quantile of issue-to-completion days over d's rows completed by
    `decision`; a deployment on that date can compute it from the source's own records."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    return float(np.quantile(y[y <= win], q))


RECENT_YEARS = 3  # session 104, cpin_es3_ncr: only builds completed in the RECENT_YEARS years before D count


def recent_threshold(d, decision, q=STALE_Q, years=RECENT_YEARS):
    """Session 104 (cpin_es3_ncr): the q-quantile of issue-to-completion days over d's rows whose completion
    date (start + y) falls in the `years` years before `decision`: a cut that moves with the source's recent
    completions (session 93's q_threshold pooled every year). A deployment on `decision` can compute it."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    m = np.isfinite(y) & (y <= win) & (win - y < 365.25 * years)
    return float(np.quantile(y[m], q))


BATCH_N = 10  # session 105, cpin_es3_ncrd: a day closing more than this many old permits is a batch close-out
OLD_DAYS = 2922  # session 105: "old" = issued more than 8 years before completion (session 104's open_share count)
RECENT_Q = {"cpin_es3_ncr": STALE_Q, "cpin_es3_ncr95": 0.95, "cpin_es3_ncrd": STALE_Q}  # session 105


def batch_days(d, n=BATCH_N, old_days=OLD_DAYS):
    """Session 105: bool mask of d's completed rows whose completion day (start + y) is a day on which more than
    `n` of d's completions closed permits issued more than `old_days` earlier. Every completion on such a day is
    masked (not only the old ones): the day is treated as an administrative sweep."""
    y = d.y.to_numpy(float)
    fin = np.isfinite(y)
    start = pd.to_datetime(d.start).to_numpy("datetime64[D]")
    comp = np.where(fin, start + np.where(fin, y, 0).astype("timedelta64[D]"), np.datetime64("NaT", "D"))
    old = fin & (y > old_days)
    days, counts = np.unique(comp[old], return_counts=True)
    bad = days[counts > n]
    return fin & np.isin(comp, bad)


def recent_threshold_robust(d, decision, variant):
    """Session 105: recent_threshold at RECENT_Q[variant]; for cpin_es3_ncrd, after batch_days rows are dropped.
    Returns (threshold, number of rows dropped as batch close-outs)."""
    nb = 0
    if variant == "cpin_es3_ncrd":
        m = batch_days(d)
        nb, d = int(m.sum()), d[~m]
    return recent_threshold(d, decision, q=RECENT_Q[variant]), nb


def stale_drop(d, decision, days=STALE_DAYS):
    """Session 91: drop rows of d still open on `decision` whose window exceeds `days` (completed rows stay)."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    return d[~((d.y.to_numpy(float) > win) & (win > days))]


def dead_completed(d, decision):
    """Session 97: bool mask of d's rows completed by `decision` whose status is dead."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    return (d.y.to_numpy(float) <= win) & d["dead"].to_numpy(bool)


def dead_drop(d, decision, stamp=None):
    """Session 95: drop rows of d completed by `decision` whose close-out status is dead (column `dead`, from
    attach_status); rows completed later, open or never completed stay. Session 96: with `stamp` (days), drop
    only the dead rows whose label is exactly that many days."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    m = (y <= win) & d["dead"].to_numpy(bool)
    if stamp is not None:
        m &= y == stamp
    return d[~m]


def len_drop(d, decision, seed=LEN_SEED, bins=LEN_BINS):
    """Session 97: the length of the non-stamp dead closures without their class. For each city in d, bin the
    labels of its dead rows completed by `decision` whose label is not STAMP_DAYS at their decile edges; drop,
    per bin, as many live (not dead) rows completed by `decision` with labels in that bin, chosen at random
    (np.random.default_rng(seed)). The dead rows stay. Returns (kept frame, n dropped, n short): short counts
    dead rows a bin could not match because it had fewer live rows."""
    s = pd.to_datetime(d.start).dt.date
    win = np.array([(decision - x).days for x in s], dtype=float)
    y = d.y.to_numpy(float)
    done, dead = y <= win, d["dead"].to_numpy(bool)
    city = d.city.to_numpy()
    rng = np.random.default_rng(seed)
    drop, short = np.zeros(len(d), bool), 0
    for c in sorted(set(city)):
        src = done & dead & (y != STAMP_DAYS) & (city == c)
        if not src.any():
            continue
        edges = np.unique(np.quantile(y[src], np.linspace(0, 1, bins + 1)))
        if len(edges) < 2:
            edges = np.array([y[src][0], y[src][0]])
        b_src = np.clip(np.searchsorted(edges, y[src], side="right") - 1, 0, len(edges) - 2)
        pool = done & ~dead & (city == c) & (y >= edges[0]) & (y <= edges[-1])
        idx = np.flatnonzero(pool)
        b_pool = np.clip(np.searchsorted(edges, y[idx], side="right") - 1, 0, len(edges) - 2)
        for b in range(len(edges) - 1):
            need, cand = int((b_src == b).sum()), idx[b_pool == b]
            take = min(need, len(cand))
            short += need - take
            if take:
                drop[rng.choice(cand, take, replace=False)] = True
    return d[~drop], int(drop.sum()), short


def attach_status(df, path):
    """Session 95: mark each completed row of df dead (bool column `dead`) when the status pull
    (status_pull.py, DATA_DIR/<city>_status.csv) has a dead row with the same permit id and completion day."""
    st = pd.read_csv(path, dtype=str, keep_default_na=False)
    dead = set(zip(st.permit_id[st.group == "dead"], st.completed[st.group == "dead"]))
    df = df.copy()
    df["dead"] = [(p, c) in dead for p, c in zip(df.permit_id, df.completed)]
    return df


def splits(frames, held, Y, variant, floor=0.05):
    """(train, early-stopping, train weights, early-stopping weights) source rows for one variant; weights are
    None when unweighted. The held-out city is never read."""
    D = datetime.date(Y, 1, 1)
    src = [c for c in transfer.CITIES if c != held and c in frames]
    cat = lambda f: pd.concat([frames[c][f(frames[c])] for c in src])  # noqa: E731
    if variant.startswith("cens_"):
        km = {c: frames[c][frames[c].year <= Y - 2].assign(city=c) for c in src}
        cap = variant.endswith("_cap")
        def ccat(f):
            parts = [transfer.censored_pseudo(frames[c][f(frames[c])].assign(city=c), D, km[c], cap=cap) for c in src]
            return (pd.concat([p[0] for p in parts]),
                    {t: np.concatenate([p[1][t] for p in parts]) for t in transfer.TAUS}, [p[2] for p in parts])
        if variant.startswith("cens_cut"):
            tr, w, _ = ccat(lambda d: d.year <= Y - 2)
            return tr, cat(lambda d: d.year == Y - 1), w, None
        tr, w, _ = ccat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2))
        ca, wca, _ = ccat(lambda d: d.year == Y - 3)
        return tr, ca, w, wca
    if variant in ("ipcw_cut", "ipcw_es3"):
        def wcat(f):
            parts = [transfer.ipcw_completed(frames[c][f(frames[c])].assign(city=c), D, floor) for c in src]
            return pd.concat([p[0] for p in parts]), np.concatenate([p[1] for p in parts])
        if variant == "ipcw_cut":
            tr, w = wcat(lambda d: d.year <= Y - 2)
            return tr, cat(lambda d: d.year == Y - 1), w, None
        tr, w = wcat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2))
        ca, wca = wcat(lambda d: d.year == Y - 3)
        return tr, ca, w, wca
    if variant == "es3":
        return (transfer.completed_by(cat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2)), D),
                transfer.completed_by(cat(lambda d: d.year == Y - 3), D), None, None)
    tr, ca = cat(lambda d: d.year <= Y - 2), cat(lambda d: d.year == Y - 1)
    if variant == "cut_only":
        tr = transfer.completed_by(tr, D)
    return tr, (transfer.completed_by(ca, D) if variant == "es_truncate" else ca), None, None


def cpin_rounds(frames, held, Y, variant, seeds, score=False, pulled=None):
    """Session 90: the cpin_* variants (censored pinball loss, src/cpin.py). Session 91: frames may hold
    never-completed rows (y = inf, transfer.frame(keep_open=True)); the non-_nc variants then drop them from the
    sources, and the test year is scored on its completed rows as before, plus a censored test loss over all its
    rows (never-completed ones with their window at `pulled`, a datetime.date)."""
    import cpin
    D = datetime.date(Y, 1, 1)
    nc = variant.startswith("cpin_es3_nc")
    frames_all = frames
    frames = {c: (d if nc and c != held else d[np.isfinite(d.y.to_numpy(float))]) for c, d in frames.items()}
    src = [c for c in transfer.CITIES if c != held and c in frames]
    cat = lambda f: pd.concat([frames[c][f(frames[c])] for c in src])  # noqa: E731
    thresholds, n_dead_dropped, dead_by_city, len_matched, n_batch = None, None, None, None, None
    if variant == "cpin_cut":
        tr, ca = cat(lambda d: d.year <= Y - 2), cat(lambda d: d.year == Y - 1)
        ytr, otr = cpin.censor(tr, D)
        yca, oca = ca.y.to_numpy(float), np.zeros(len(ca), bool)
    else:
        tr, ca = cat(lambda d: (d.year <= Y - 4) | (d.year == Y - 2)), cat(lambda d: d.year == Y - 3)
        if variant == "cpin_es3_done":
            tr, ca = transfer.completed_by(tr, D), transfer.completed_by(ca, D)
        sel = ca  # session 92: the common selection set, before any staleness drop
        if variant in STALE:
            tr, ca = stale_drop(tr, D, STALE[variant]), stale_drop(ca, D, STALE[variant])
        if variant in DEAD_DROP:
            n0 = len(tr) + len(ca)
            before = pd.concat([tr, ca]).city.value_counts()
            st = STAMP_DAYS if variant.startswith("cpin_es3_nc5_stamp") else None
            if variant == "cpin_es3_nc5_stamp_len":  # session 97: match before the stamp drop (labels unchanged)
                (tr, n_len_tr, sh_tr), (ca, n_len_ca, sh_ca) = len_drop(tr, D), len_drop(ca, D)
                len_matched = dict(n_dropped=n_len_tr + n_len_ca, n_short=sh_tr + sh_ca)
            if variant == "cpin_es3_nc5_stamp_long":
                long_ = lambda f: f[~(dead_completed(f, D) & (f.y.to_numpy(float) != STAMP_DAYS)  # noqa: E731
                                      & (f.y.to_numpy(float) > LONG_DAYS))]
                tr, ca = long_(tr), long_(ca)
            tr, ca = dead_drop(tr, D, st), dead_drop(ca, D, st)
            n_dead_dropped = n0 - len(tr) - len(ca)
            dead_by_city = {c: int(before.get(c, 0) - n) for c, n in pd.concat([tr, ca]).city.value_counts().items()}
        if variant == "cpin_es3_ncq":
            # session 93: a cut per source city, from its own builds of years <= Y-2 completed by D
            thresholds = {c: q_threshold(frames[c][(frames[c].year <= Y - 2) & np.isfinite(frames[c].y)], D)
                          for c in src}
            tr = pd.concat([stale_drop(frames[c][(frames[c].year <= Y - 4) | (frames[c].year == Y - 2)], D,
                                       thresholds[c]) for c in src])
            ca = pd.concat([stale_drop(frames[c][frames[c].year == Y - 3], D, thresholds[c]) for c in src])
        if variant in RECENT_Q:
            # session 104: a cut per source city from its builds completed in the 3 years before D
            # session 105: at the 0.95 quantile (ncr95), or after batch close-out days are dropped (ncrd)
            rt = {c: recent_threshold_robust(frames[c][(frames[c].year <= Y - 1) & np.isfinite(frames[c].y)], D,
                                             variant) for c in src}
            thresholds = {c: v[0] for c, v in rt.items()}
            if variant == "cpin_es3_ncrd":
                n_batch = {c: v[1] for c, v in rt.items()}
            tr = pd.concat([stale_drop(frames[c][(frames[c].year <= Y - 4) | (frames[c].year == Y - 2)], D,
                                       thresholds[c]) for c in src])
            ca = pd.concat([stale_drop(frames[c][frames[c].year == Y - 3], D, thresholds[c]) for c in src])
        ytr, otr = cpin.censor(tr, D)
        yca, oca = cpin.censor(ca, D)
        ysel, osel = cpin.censor(sel, D)
    te = frames[held][frames[held].year == Y]
    te_all = frames_all[held][frames_all[held].year == Y]
    tgt = None
    if os.environ.get("CPIN_TARGET_SEL") and variant != "cpin_cut":  # session 98: the target's own Y-3 rows
        tg = frames_all[held][frames_all[held].year == Y - 3]
        ytg, otg = cpin.censor(tg, D)
        ytg = np.where(np.isfinite(ytg), ytg, 0.0)  # never-completed rows are open at D (window), y unused
        tgt = dict(n=len(tg), n_open=int(otg.sum()), loss={}, closs={})
        # session 99: older target cohorts (longer follow-up) and IPCW weights on each cohort's completed rows
        tk = {}
        for k in TGT_KS:
            tkd = frames_all[held][frames_all[held].year == Y - k]
            yk, ok = cpin.censor(tkd, D)
            _, wk = transfer.ipcw_completed(tkd.assign(city=held), D)
            tk[k] = dict(y=np.where(np.isfinite(yk), yk, 0.0), o=ok, w=wk, n=len(tkd), n_open=int(ok.sum()),
                         X=transfer.feats(tkd), loss={}, ipcw={})
    has_open = bool(np.isinf(te_all.y.to_numpy(float)).any())
    if score and has_open:
        yta, ota = cpin.censor(te_all, pulled)
    Xtr, Xca = transfer.feats(tr), transfer.feats(ca)
    Xte = transfer.feats(te_all if has_open else te) if score else Xca.iloc[:1]
    n_te = len(Xte)
    if nc:  # session 92: predict the selection set in the same call (one model, two row sets)
        Xte = pd.concat([Xte, transfer.feats(sel)])
    n_sel_rows = len(sel) if nc else 0
    if tgt is not None:  # session 98: and the target's own Y-3 rows
        Xte = pd.concat([Xte, transfer.feats(tg)] + [tk[k]["X"] for k in TGT_KS])
        n_tg = len(tg)
    done_te = np.isfinite(te_all.y.to_numpy(float)) if has_open else np.ones(len(te), bool)
    live = ~te["dead"].to_numpy(bool) if "dead" in te else None  # session 95: among completed test rows
    taus = (0.5, 0.9)  # q0.1 is untouched by open permits and costs most rounds (300 in es3); skipped for time
    # session 95: CPIN_TAUS=0.9 fits the tail model only (q0.5 is 85% of an SF fit's time and no prediction used it)
    taus = tuple(float(x) for x in os.environ.get("CPIN_TAUS", "").split(",") if x) or taus
    sel_loss, loss_live = {t: [] for t in taus}, {t: [] for t in taus}
    rows_dir = os.environ.get("CPIN_ROWS_DIR")  # session 101: save q0.9 predictions per row and seed here
    test_rows = []
    out, loss, preds, closs_te = {}, {t: [] for t in taus}, {}, {t: [] for t in taus}
    for s in range(seeds):
        r = {}
        for t in taus:
            t0 = time.time()
            pr, r[t] = cpin.fit_one(Xtr, ytr, otr, Xca, yca, oca, Xte, t, seed=s)
            if tgt is not None:
                pt = pr[n_te + n_sel_rows:n_te + n_sel_rows + n_tg]
                off = n_te + n_sel_rows + n_tg
                for k in TGT_KS:  # session 99
                    pk, d_k = pr[off:off + tk[k]["n"]], tk[k]
                    off += d_k["n"]
                    c_k = ~d_k["o"]
                    pin_k = boosted.pin(d_k["y"][c_k], pk[c_k], t) if c_k.any() else None
                    d_k["loss"].setdefault(str(t), []).append(None if pin_k is None else float(pin_k.mean()))
                    d_k["ipcw"].setdefault(str(t), []).append(
                        None if pin_k is None else float((d_k["w"] * pin_k).sum() / d_k["w"].sum()))
                    if rows_dir and t == 0.9:  # session 101: per-row predictions, for a paired bootstrap
                        d_k.setdefault("pred", []).append(pk.astype(np.float32))
                tgt["loss"].setdefault(str(t), []).append(
                    float(boosted.pin(ytg[~otg], pt[~otg], t).mean()) if (~otg).any() else None)
                tgt["closs"].setdefault(str(t), []).append(float(cpin.closs(ytg, pt, otg, t).mean()))
                pr = pr[:n_te + n_sel_rows]
            if nc:
                sel_loss[t].append(float(cpin.closs(ysel, pr[n_te:], osel, t).mean()))
                pr = pr[:n_te]
            print(f"  {held} {Y} {variant} seed {s} tau {t}: {r[t]} rounds, {time.time() - t0:.0f} s", flush=True)
            if score:
                loss[t].append(float(boosted.pin(te.y.to_numpy(float), pr[done_te], t).mean()))
                if rows_dir and t == 0.9:  # session 101
                    test_rows.append(pr[done_te].astype(np.float32))
                if live is not None:
                    loss_live[t].append(float(boosted.pin(te.y.to_numpy(float)[live], pr[done_te][live], t).mean()))
                if has_open:
                    closs_te[t].append(float(cpin.closs(yta, pr, ota, t).mean()))
                if t == 0.9:
                    preds[str(s)] = dict(max=float(pr[done_te].max()), share_above_3650=float((pr[done_te] > 3650).mean()),
                                         mean=float(pr[done_te].mean()))
        out[str(s)] = {str(t): int(v) for t, v in r.items()}
    res = dict(n_train=len(tr), n_es=len(ca), n_train_open=int(otr.sum()), n_es_open=int(oca.sum()), rounds=out)
    if n_dead_dropped is not None:
        res["n_dead_dropped"], res["n_dead_by_city"] = n_dead_dropped, dead_by_city
    if len_matched is not None:
        res["len_matched"] = len_matched
    if "dead" in tr:
        res["n_train_dead_by_D"] = int(len(tr) - len(dead_drop(tr, D)))
        res["n_es_dead_by_D"] = int(len(ca) - len(dead_drop(ca, D)))
    if score and live is not None:
        res["n_test_dead"] = int((~live).sum())
        res["test_loss_live"] = {str(t): sum(v) / len(v) for t, v in loss_live.items()}
        res["test_loss_live_per_seed"] = {str(t): v for t, v in loss_live.items()}
    res["n_train_never_completed"] = int(np.isinf(tr.y.to_numpy(float)).sum())
    res["n_es_never_completed"] = int(np.isinf(ca.y.to_numpy(float)).sum())
    if tgt is not None:
        res["tgt_n"], res["tgt_n_open"] = tgt["n"], tgt["n_open"]
        res["tgt_loss_per_seed"], res["tgt_closs_per_seed"] = tgt["loss"], tgt["closs"]
        res["tgt_loss"] = {t: float(np.mean(v)) for t, v in tgt["loss"].items()}
        res["tgt_closs"] = {t: float(np.mean(v)) for t, v in tgt["closs"].items()}
        res["tgt_k"] = {str(k): dict(n=d_k["n"], n_open=d_k["n_open"], loss_per_seed=d_k["loss"],
                                     ipcw_per_seed=d_k["ipcw"],
                                     loss={t: float(np.mean(v)) for t, v in d_k["loss"].items()},
                                     ipcw={t: float(np.mean(v)) for t, v in d_k["ipcw"].items()})
                        for k, d_k in tk.items()}
    if rows_dir:  # session 101: one .npz per cell and variant; rows are in frame order, the same for every variant
        arrs = dict(test_y=te.y.to_numpy(np.float32), test_pred=np.array(test_rows))
        for k, d_k in (tk.items() if tgt is not None else ()):
            arrs.update({f"k{k}_y": d_k["y"].astype(np.float32), f"k{k}_open": d_k["o"], f"k{k}_w": d_k["w"],
                         f"k{k}_pred": np.array(d_k.get("pred", []))})
        os.makedirs(rows_dir, exist_ok=True)
        np.savez_compressed(os.path.join(rows_dir, f"{held}_{Y}_{variant}.npz"), **arrs)
    if thresholds is not None:
        res["stale_threshold_days"] = thresholds
    if n_batch is not None:
        res["n_batch_rows_dropped"] = n_batch
    if nc:
        res["n_sel"], res["n_sel_open"] = len(sel), int(osel.sum())
        res["sel_closs"] = {str(t): sum(v) / len(v) for t, v in sel_loss.items()}
        res["sel_closs_per_seed"] = {str(t): v for t, v in sel_loss.items()}
    if score:
        res["n_test"] = len(te)
        res["test_loss_per_seed"] = {str(t): v for t, v in loss.items()}
        if has_open:
            res["n_test_never_completed"] = int(ota.sum())
            res["test_closs_all"] = {str(t): sum(v) / len(v) for t, v in closs_te.items()}
            res["test_closs_all_per_seed"] = {str(t): v for t, v in closs_te.items()}
        res["test_loss"] = {str(t): sum(v) / len(v) for t, v in loss.items()}
        res["test_pred_q90"] = preds
    return res


def rounds(frames, held, Y, variant, seeds, score=False, floor=0.05, pulled=None):
    if variant.startswith("cpin_"):
        return cpin_rounds(frames, held, Y, variant, seeds, score, pulled)
    tr, ca, w, wca = splits(frames, held, Y, variant, floor)
    te = frames[held][frames[held].year == Y]
    xt = transfer.feats(te) if score else transfer.feats(ca.iloc[:1])
    out, loss, preds = {}, {t: [] for t in transfer.TAUS}, {}
    for s in range(seeds):
        pr, _, r, _ = boosted.fit_predict(transfer.feats(tr), tr.y.to_numpy(float), transfer.feats(ca),
                                          ca.y.to_numpy(float), xt, seed=s, classifier=False,
                                          w=w, wca=wca)
        out[str(s)] = {str(t): int(v) for t, v in r.items()}
        if score:
            for t in transfer.TAUS:
                loss[t].append(float(boosted.pin(te.y.to_numpy(float), pr[t], t).mean()))
            preds[str(s)] = dict(max=float(pr[0.9].max()), share_above_3650=float((pr[0.9] > 3650).mean()))
    res = dict(n_train=len(tr), n_es=len(ca), rounds=out)
    if isinstance(w, dict):
        res["pseudo"] = {str(t): dict(sum=float(v.sum()), on_inf=float(v[tr.y.to_numpy(float) >= transfer.Y_INF].sum()))
                         for t, v in w.items()}
    elif w is not None:
        res["weights"] = dict(floor=floor, max=float(w.max()), mean=float(w.mean()), share_above_1=float((w > 1).mean()),
                              ess=float(w.sum() ** 2 / (w ** 2).sum()), sum=float(w.sum()))
    if score:
        res["n_test"] = len(te)
        res["test_loss"] = {str(t): sum(v) / len(v) for t, v in loss.items()}
        res["test_pred_q90"] = preds
    return res


def summarise(rounds_path, res_dir, held=("austin", "sf", "seattle"), years=(2021, 2022)):
    """Per cell and variant: cascade2's mean round count per quantile (3 seeds) next to cascade2's test-year
    loss change against session 84's complete-label model (select_deploy_<held>_i2c_<year>.json), in days.
    Session 86 (deploy) rounds come from its result files; es3's from this file or select_deploy_es3_*.json."""
    import numpy as np
    R = json.load(open(rounds_path))
    tag = {"es_truncate": "_es", "deploy": "_dep", "es3": "_es3"}
    cells = []
    for h in held:
        for Y in years:
            b = json.load(open(os.path.join(res_dir, f"select_deploy_{h}_i2c_{Y}.json")))
            for v in ("full", "es_truncate", "deploy", "es3"):
                if v == "deploy":
                    r = json.load(open(os.path.join(res_dir, f"select_deploy_dep_{h}_i2c_{Y}.json")))
                    rr = r["deploy_detail"]["cascade2"]["rounds"]
                elif f"{h} {Y} {v}" in R:
                    rr = R[f"{h} {Y} {v}"]["rounds"]
                else:
                    rr = json.load(open(os.path.join(res_dir, f"select_deploy_es3_{h}_i2c_{Y}.json")))["transfer_rounds"]["cascade2"]
                row = dict(held=h, year=Y, variant=v,
                           rounds={t: float(np.mean([s[t] for s in rr.values()])) for t in ("0.1", "0.5", "0.9")})
                if v != "full":
                    r = json.load(open(os.path.join(res_dir, f"select_deploy{tag[v]}_{h}_i2c_{Y}.json")))
                    row["cascade2_loss_change"] = {t: r["by_tau"][t]["test_loss"]["cascade2"] - b["by_tau"][t]["test_loss"]["cascade2"]
                                                   for t in ("0.5", "0.9")}
                cells.append(row)
    full = {(c["held"], c["year"]): c["rounds"] for c in cells if c["variant"] == "full"}
    out = dict(note="cascade2 candidate; rounds = mean of 3 seeds; loss change in days of mean pinball loss on all "
                    "test-year rows against session 84 (variant full); negative = better", cells=cells, by_variant={})
    for v in ("es_truncate", "deploy", "es3"):
        cs = [c for c in cells if c["variant"] == v]
        q9 = [c["rounds"]["0.9"] for c in cs]
        ratio = [c["rounds"]["0.9"] / full[(c["held"], c["year"])]["0.9"] for c in cs]
        ch = [c["cascade2_loss_change"]["0.9"] for c in cs]
        out["by_variant"][v] = dict(q90_rounds_min=min(q9), q90_rounds_max=max(q9),
                                    q90_rounds_ratio_to_full=[round(x, 3) for x in ratio],
                                    q90_cascade2_loss_change_mean=float(np.mean(ch)),
                                    q90_cascade2_loss_change=[round(x, 2) for x in ch])
    lr = [np.log(c["rounds"]["0.9"] / full[(c["held"], c["year"])]["0.9"]) for c in cells if c["variant"] != "full"]
    ch = [c["cascade2_loss_change"]["0.9"] for c in cells if c["variant"] != "full"]
    from scipy.stats import spearmanr
    rho = spearmanr(lr, ch)
    out["spearman_log_round_ratio_vs_q90_loss_change"] = dict(rho=float(rho.statistic), p=float(rho.pvalue), n=len(lr))
    return out


def ipcw_summary(path, held=("austin", "sf", "seattle"), years=(2021, 2022)):
    """Session 88: per cell, each variant's cascade2 test loss change against full (days; q0.5, q0.9), the q0.9
    rounds (mean of seeds), the share of cut_only's q0.9 cost the weights recover, and predictions G1 to G5."""
    R = json.load(open(path))
    cells = []
    for h in held:
        for Y in years:
            if f"{h} {Y} full" not in R:
                continue
            f = R[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, full={t: f[t] for t in ("0.5", "0.9")}, change={}, q90_rounds={})
            for v in VARIANTS:
                k = f"{h} {Y} {v}"
                if k not in R:
                    continue
                row["change"][v] = {t: R[k]["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["q90_rounds"][v] = float(np.mean([r["0.9"] for r in R[k]["rounds"].values()]))
                if "weights" in R[k]:
                    row.setdefault("weights", {})[v] = R[k]["weights"]
            c = row["change"]
            if "cut_only" in c and "ipcw_cut" in c and c["cut_only"]["0.9"] > 0:
                row["ipcw_cut_recovered_share_q90"] = 1 - c["ipcw_cut"]["0.9"] / c["cut_only"]["0.9"]
            cells.append(row)
    sw = [c for c in cells if c["held"] in ("sf", "seattle")]
    au = [c for c in cells if c["held"] == "austin"]
    g = dict(
        G1=sum(abs(c["change"]["ipcw_cut"]["0.9"]) <= 1 for c in sw),
        G2=sum(c.get("ipcw_cut_recovered_share_q90", 0) >= 0.5 for c in sw),
        G3=sum(c["change"]["ipcw_es3"]["0.9"] < c["change"]["es3"]["0.9"] for c in sw),
        G4=sum(c["change"]["ipcw_cut"]["0.9"] > c["change"]["cut_only"]["0.9"] for c in au),
        G5=sum(abs(c["change"]["ipcw_cut"]["0.5"]) <= 0.5 for c in cells))
    verdict = dict(G1=g["G1"] >= 3, G2=g["G2"] >= 3, G3=g["G3"] >= 3, G4=g["G4"] == len(au) == 2, G5=g["G5"] == len(cells) == 6)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells if v in c["change"]])) for t in ("0.5", "0.9")}
            for v in VARIANTS if all(v in c["change"] for c in cells)}
    return dict(note="cascade2 transfer model; change = variant's mean pinball loss on all test-year rows minus full's, "
                     "days (negative = better); 3 seeds; SF and Seattle counts are of 4 city-years, Austin of 2",
                cells=cells, mean_change=mean, counts=g, held=verdict)


def cens_summary(path, base_path, held=("austin", "sf", "seattle"), years=(2021, 2022)):
    """Session 89: the cens_* variants (this file) against session 88's full, cut_only, es3, ipcw_cut and ipcw_es3
    (base_path): per cell the q0.5 / q0.9 loss change against full in days, the q0.9 rounds, the share of
    cut_only's q0.9 cost each of ipcw_cut and cens_cut[_cap] recovers, and predictions C1 to C5 for each of the
    pre-registered (+infinity) and the post hoc capped pseudo-rows."""
    R = dict(json.load(open(base_path)))
    R.update(json.load(open(path)))
    vs = tuple(v for v in ("cut_only", "ipcw_cut", "cens_cut", "cens_cut_cap", "es3", "ipcw_es3", "cens_es3", "cens_es3_cap")
               if all(f"{h} {Y} {v}" in R for h in held for Y in years))
    cells = []
    for h in held:
        for Y in years:
            f = R[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, full={t: f[t] for t in ("0.5", "0.9")}, change={}, q90_rounds={}, recovered_q90={})
            for v in vs:
                k = f"{h} {Y} {v}"
                row["change"][v] = {t: R[k]["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["q90_rounds"][v] = float(np.mean([r["0.9"] for r in R[k]["rounds"].values()]))
            c = row["change"]
            for v in ("ipcw_cut", "cens_cut", "cens_cut_cap"):
                if v in c and c["cut_only"]["0.9"] > 0:
                    row["recovered_q90"][v] = 1 - c[v]["0.9"] / c["cut_only"]["0.9"]
            cells.append(row)
    sw = [c for c in cells if c["held"] in ("sf", "seattle")]
    au = [c for c in cells if c["held"] == "austin"]
    sw_mean = {v: float(np.mean([c["change"][v]["0.9"] for c in sw])) for v in vs}

    def preds(sfx):
        cu, es = "cens_cut" + sfx, "cens_es3" + sfx
        g = dict(C1=sum(abs(c["change"][cu]["0.9"]) <= 1 for c in sw),
                 C2=sum(c["recovered_q90"].get(cu, 0) >= 0.5 for c in sw),
                 C3=sum(c["change"][es]["0.9"] < c["change"]["ipcw_es3"]["0.9"] for c in sw),
                 C4=sum(c["change"][cu]["0.9"] > c["change"]["cut_only"]["0.9"] for c in au),
                 C5=sum(abs(c["change"][cu]["0.5"]) <= 0.5 for c in cells))
        return g, dict(C1=g["C1"] >= 3, C2=g["C2"] >= 3, C3=g["C3"] >= 3 and sw_mean[es] < sw_mean["ipcw_es3"],
                       C4=g["C4"] == 2, C5=g["C5"] >= 5)
    counts, verdict = {}, {}
    for sfx in ("", "_cap"):
        if "cens_cut" + sfx in vs and "cens_es3" + sfx in vs:
            counts["cens" + sfx], verdict["cens" + sfx] = preds(sfx)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells])) for t in ("0.5", "0.9")} for v in vs}
    return dict(note="cascade2 transfer model; change = variant's mean pinball loss on all test-year rows minus full's "
                     "(session 88's rounds_score_ipcw_i2c.json), days, negative = better; 3 seeds",
                cells=cells, mean_change=mean, sf_seattle_q90_mean_change=sw_mean, counts=counts, held=verdict)


def cpin_summary(path, base_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 90: the cpin_* variants (this file) against session 88's full, cut_only, es3 and ipcw_es3 (base_path):
    per cell the q0.5 / q0.9 loss change against full, the q0.9 rounds and prediction maxima, the share of
    cut_only's q0.9 cost cpin_cut recovers, and predictions P1 to P6."""
    R = dict(json.load(open(base_path)))
    R.update(json.load(open(path)))
    vs = ("cut_only", "es3", "ipcw_es3", "cpin_cut", "cpin_es3")
    cells = []
    for h in held:
        for Y in years:
            if not all(f"{h} {Y} {v}" in R for v in vs):
                continue
            f = R[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, full={t: f[t] for t in ("0.5", "0.9")}, change={}, q90_rounds={}, q90_pred_max={})
            for v in vs:
                k = f"{h} {Y} {v}"
                row["change"][v] = {t: R[k]["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["q90_rounds"][v] = float(np.mean([r["0.9"] for r in R[k]["rounds"].values()]))
                if "test_pred_q90" in R[k]:
                    row["q90_pred_max"][v] = max(p["max"] for p in R[k]["test_pred_q90"].values())
            c = row["change"]
            row["cpin_cut_recovered_q90"] = 1 - c["cpin_cut"]["0.9"] / c["cut_only"]["0.9"] if c["cut_only"]["0.9"] > 0 else None
            cells.append(row)
    sw = {v: {t: float(np.mean([c["change"][v][t] for c in cells])) for t in ("0.5", "0.9")} for v in vs}
    g = dict(P2=sum(c["change"]["cpin_es3"]["0.9"] < c["change"]["ipcw_es3"]["0.9"] for c in cells),
             P3=sum(c["q90_pred_max"][v] > 3650 for c in cells for v in ("cpin_cut", "cpin_es3")),
             P4=sum(abs(c["change"]["cpin_cut"]["0.9"]) <= 1 for c in cells),
             P5=sum((c["cpin_cut_recovered_q90"] or 0) >= 0.5 for c in cells))
    verdict = dict(P1=sw["cpin_es3"]["0.9"] < sw["ipcw_es3"]["0.9"], P2=g["P2"] >= 3, P3=g["P3"] == 0,
                   P4=g["P4"] >= 3, P5=g["P5"] >= 3, P6=sw["cpin_es3"]["0.5"] <= sw["ipcw_es3"]["0.5"])
    return dict(note="cascade2 transfer model; change = variant's mean pinball loss on all test-year rows minus full's "
                     "(session 88's rounds_score_ipcw_i2c.json), days, negative = better; 3 seeds; P3 counts cell-"
                     "variants whose largest q0.9 test prediction (over seeds) exceeds 3,650 days",
                cells=cells, n_cells=len(cells), mean_change=sw, counts=g, held=verdict)


def nc_summary(path, base_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 91: cpin_es3, cpin_es3_nc, cpin_es3_nc5 (this file) against session 88's full (base_path): per cell
    the q0.5 / q0.9 loss change against full on completed test rows, the censored test loss over all test rows,
    the q0.9 rounds and prediction maxima, the never-completed row counts, and predictions N1 to N5 (N5 against
    session 90's results/rounds_score_cpin_i2c.json)."""
    B = json.load(open(base_path))
    R = json.load(open(path))
    s90 = json.load(open(os.path.join(os.path.dirname(path), "rounds_score_cpin_i2c.json")))
    vs = ("cpin_es3", "cpin_es3_nc", "cpin_es3_nc5")
    cells = []
    for h in held:
        for Y in years:
            if not all(f"{h} {Y} {v}" in R for v in vs):
                continue
            f = B[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, full={t: f[t] for t in ("0.5", "0.9")}, loss={}, change={}, closs_all={},
                       q90_rounds={}, q90_pred_max={}, n_never_completed={})
            for v in vs:
                r = R[f"{h} {Y} {v}"]
                row["loss"][v] = {t: r["test_loss"][t] for t in ("0.5", "0.9")}
                row["change"][v] = {t: r["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["closs_all"][v] = r.get("test_closs_all")
                row["q90_rounds"][v] = float(np.mean([x["0.9"] for x in r["rounds"].values()]))
                row["q90_pred_max"][v] = max(p["max"] for p in r["test_pred_q90"].values())
                row["n_never_completed"][v] = dict(train=r["n_train_never_completed"], es=r["n_es_never_completed"],
                                                   train_open=r["n_train_open"], n_train=r["n_train"],
                                                   test=r.get("n_test_never_completed"), n_test=r["n_test"])
            row["s90_cpin_es3_q90"] = s90.get(f"{h} {Y} cpin_es3", {}).get("test_loss", {}).get("0.9")
            cells.append(row)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells])) for t in ("0.5", "0.9")} for v in vs}
    L = lambda c, v, t="0.9": c["loss"][v][t]  # noqa: E731
    g = dict(N1=sum(L(c, "cpin_es3_nc") > L(c, "cpin_es3") for c in cells),
             N3=sum(c["closs_all"]["cpin_es3_nc"]["0.9"] < c["closs_all"]["cpin_es3"]["0.9"] for c in cells),
             N5=sum(c["s90_cpin_es3_q90"] is not None and abs(L(c, "cpin_es3") - c["s90_cpin_es3_q90"]) <= 0.3
                    for c in cells))
    verdict = dict(N1=g["N1"] >= 3, N2=abs(mean["cpin_es3_nc5"]["0.9"] - mean["cpin_es3"]["0.9"]) <= 1, N3=g["N3"] >= 3,
                   N4=mean["cpin_es3_nc"]["0.5"] - mean["cpin_es3"]["0.5"] <= 1, N5=g["N5"] == len(cells) == 4)
    return dict(note="cascade2 transfer model; change = mean pinball loss on completed test-year rows minus session "
                     "88's full, days, negative = better; closs_all = mean censored pinball loss over all test-year "
                     "rows, never-completed ones with their window at the pull date; 3 seeds",
                cells=cells, n_cells=len(cells), mean_change=mean, counts=g, held=verdict)


SWEEP = ("cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc5", "cpin_es3_nc8")


def sweep_summary(path, base_path, s91_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 92: the staleness sweep (this file) against session 88's full (base_path). Per cell: each
    threshold's q0.5 / q0.9 loss change against full on completed test rows, its censored loss over all test rows,
    its q0.9 selection loss (sel_closs, Y-3 as seen on D), the threshold the selection loss picks, and the per-cell
    oracle. Predictions S1 to S5 (S5 against session 91's s91_path)."""
    B, R, S91 = json.load(open(base_path)), json.load(open(path)), json.load(open(s91_path))
    cells = []
    for h in held:
        for Y in years:
            if not all(f"{h} {Y} {v}" in R for v in SWEEP):
                continue
            f = B[f"{h} {Y} full"]["test_loss"]
            row = dict(held=h, year=Y, change={}, closs_all={}, sel_q90={}, q90_rounds={}, kept_open={})
            for v in SWEEP:
                r = R[f"{h} {Y} {v}"]
                row["change"][v] = {t: r["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["closs_all"][v] = r["test_closs_all"]
                row["sel_q90"][v] = r["sel_closs"]["0.9"]
                row["q90_rounds"][v] = float(np.mean([x["0.9"] for x in r["rounds"].values()]))
                row["kept_open"][v] = dict(train_never_completed=r["n_train_never_completed"],
                                           train_open=r["n_train_open"], es_open=r["n_es_open"])
            row["selected"] = min(SWEEP, key=lambda v: row["sel_q90"][v])
            row["oracle"] = min(SWEEP, key=lambda v: row["change"][v]["0.9"])
            row["selected_change"] = row["change"][row["selected"]]
            row["regret_q90"] = row["change"][row["selected"]]["0.9"] - row["change"][row["oracle"]]["0.9"]
            row["s91_nc5_q90"] = S91.get(f"{h} {Y} cpin_es3_nc5", {}).get("test_loss", {}).get("0.9")
            s91 = S91.get(f"{h} {Y} cpin_es3")
            row["s91_cpin_es3_change_q90"] = s91["test_loss"]["0.9"] - f["0.9"] if s91 else None
            cells.append(row)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells])) for t in ("0.5", "0.9")} for v in SWEEP}
    mean["selected"] = {t: float(np.mean([c["selected_change"][t] for c in cells])) for t in ("0.5", "0.9")}
    ch = lambda c, v: c["change"][v]["0.9"]  # noqa: E731
    sf = [c for c in cells if c["held"] == "sf"]
    se = [c for c in cells if c["held"] == "seattle"]
    best_fixed = min(SWEEP, key=lambda v: mean[v]["0.9"])
    verdict = dict(
        S1=all(ch(c, "cpin_es3_nc3") < ch(c, "cpin_es3_nc5") for c in sf)
        and all(min(ch(c, "cpin_es3_nc5"), ch(c, "cpin_es3_nc8")) < ch(c, "cpin_es3_nc3") for c in se),
        S2=mean["cpin_es3_nc8"]["0.9"] - mean["cpin_es3_nc5"]["0.9"] > 1,
        S3=float(np.mean([c["regret_q90"] for c in cells])) <= 1,
        S4=mean["selected"]["0.9"] <= 0,
        S5=len(cells) == 4 and len(se) == 2 and all(c["s91_nc5_q90"] is not None and
                                    abs(R[f"{c['held']} {c['year']} cpin_es3_nc5"]["test_loss"]["0.9"] - c["s91_nc5_q90"]) <= 0.3
                                    for c in cells))
    return dict(note="cascade2 transfer model; change = mean pinball loss on completed test-year rows minus session "
                     "88's full, days, negative = better; sel_q90 = q0.9 censored loss on all source Y-3 rows as seen on "
                     "D (the deployable selection score); 3 seeds",
                cells=cells, n_cells=len(cells), mean_change=mean, best_fixed_q90=best_fixed,
                mean_regret_q90=float(np.mean([c["regret_q90"] for c in cells])) if cells else None,
                held=verdict)


def ncq_summary(path, sweep_path, nc_path, base_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 93: the per-source threshold (cpin_es3_ncq, this file) beside session 92's fixed thresholds
    (sweep_path) and session 91's cpin_es3 and cpin_es3_nc5 (nc_path), against session 88's full (base_path).
    This file also holds an independent rerun of nc2, nc3 and nc8 (same pull date); `replication` is its largest
    q0.9 test-loss difference from session 92's. Predictions S1 to S5 as committed before the run."""
    B, R, W, N = (json.load(open(p)) for p in (base_path, path, sweep_path, nc_path))
    vs = ("cpin_es3", "cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc5", "cpin_es3_nc8", "cpin_es3_ncq")
    cells, rep = [], []
    for h in held:
        for Y in years:
            k = lambda v: f"{h} {Y} {v}"  # noqa: E731
            got = {v: (R.get(k(v)) if v == "cpin_es3_ncq" else W.get(k(v)) or N.get(k(v))) for v in vs}
            if not all(got.values()):
                continue
            for v in ("cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc8"):
                if k(v) in R and k(v) in W:
                    rep.append(abs(R[k(v)]["test_loss"]["0.9"] - W[k(v)]["test_loss"]["0.9"]))
            f = B[k("full")]["test_loss"]
            row = dict(held=h, year=Y, change={}, closs_all={}, q90_seed_range={},
                       ncq_threshold_days=got["cpin_es3_ncq"]["stale_threshold_days"],
                       ncq_train_open=got["cpin_es3_ncq"]["n_train_open"])
            for v, r in got.items():
                row["change"][v] = {t: r["test_loss"][t] - f[t] for t in ("0.5", "0.9")}
                row["closs_all"][v] = (r.get("test_closs_all") or {}).get("0.9")
                ps = r.get("test_loss_per_seed", {}).get("0.9")
                row["q90_seed_range"][v] = (max(ps) - min(ps)) if ps else None
            cells.append(row)
    mean = {v: {t: float(np.mean([c["change"][v][t] for c in cells])) for t in ("0.5", "0.9")} for v in vs}
    C = lambda c, v: c["change"][v]["0.9"]  # noqa: E731
    fixed = ("cpin_es3_nc2", "cpin_es3_nc3", "cpin_es3_nc5", "cpin_es3_nc8")
    best = [min(fixed, key=lambda v: C(c, v)) for c in cells]
    sf_mean = lambda v: float(np.mean([C(c, v) for c in cells if c["held"] == "sf"]))  # noqa: E731
    thr = [x for c in cells for x in c["ncq_threshold_days"].values()]
    verdict = dict(S1=mean["cpin_es3_nc8"]["0.9"] > mean["cpin_es3_nc5"]["0.9"] + 5,
                   S2=sf_mean("cpin_es3_nc2") < sf_mean("cpin_es3_nc5"),
                   S3=all(730 <= x <= 1826 for x in thr) and mean["cpin_es3_ncq"]["0.9"] <= mean["cpin_es3_nc5"]["0.9"] + 0.5,
                   S4=len(set(best)) > 1)
    return dict(note="cascade2 transfer model; change = mean pinball loss on completed test-year rows minus session "
                     "88's full, days, negative = better; closs_all = q0.9 censored pinball loss over all test-year "
                     "rows; fixed thresholds from session 92, cpin_es3 from session 91; 3 seeds",
                cells=cells, n_cells=len(cells), mean_change=mean, best_fixed_q90=best,
                sf_q90_mean={v: sf_mean(v) for v in vs}, ncq_thresholds_days=thr,
                replication_max_abs_q90_diff=max(rep) if rep else None, n_replicated=len(rep), held=verdict)


def clean_summary(path, nc_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 95: cpin_es3_nc5_clean against cpin_es3_nc5 refit on the same pull (this file), per cell: q0.5 / q0.9
    loss on all completed test rows and on the live ones (status not dead), the rows the rule drops (and how many
    are Austin's, from n_dead_by_city), the mean q0.9 prediction, rounds; predictions K1 to K5 (K5 against session
    91's nc5 in nc_path)."""
    R = json.load(open(path))
    s91 = json.load(open(nc_path))
    cells = []
    for h in held:
        for Y in years:
            a, b = R.get(f"{h} {Y} cpin_es3_nc5"), R.get(f"{h} {Y} cpin_es3_nc5_clean")
            if not (a and b):
                continue
            pm = lambda r: float(np.mean([p["mean"] for p in r["test_pred_q90"].values()]))  # noqa: E731
            n_rows = a["n_train"] + a["n_es"]
            row = dict(held=h, year=Y, n_rows_nc5=n_rows, n_dropped=b["n_dead_dropped"],
                       dropped_share=b["n_dead_dropped"] / n_rows, dropped_by_city=b.get("n_dead_by_city"),
                       n_test=a["n_test"], n_test_dead=a.get("n_test_dead"),
                       loss={v: r["test_loss"] for v, r in (("nc5", a), ("clean", b))},
                       loss_live={v: r.get("test_loss_live") for v, r in (("nc5", a), ("clean", b))},
                       diff={t: b["test_loss"][t] - a["test_loss"][t] for t in a["test_loss"]},
                       diff_live={t: b["test_loss_live"][t] - a["test_loss_live"][t] for t in a["test_loss_live"]},
                       diff_q90_per_seed=[y - x for x, y in zip(a["test_loss_per_seed"]["0.9"], b["test_loss_per_seed"]["0.9"])],
                       q90_pred_mean={"nc5": pm(a), "clean": pm(b)},
                       q90_rounds={v: float(np.mean([x["0.9"] for x in r["rounds"].values()])) for v, r in (("nc5", a), ("clean", b))},
                       s91_nc5_q90=s91.get(f"{h} {Y} cpin_es3_nc5", {}).get("test_loss", {}).get("0.9"))
            cells.append(row)
    au = lambda c: (c["dropped_by_city"] or {}).get("austin", 0) / max(c["n_dropped"], 1)  # noqa: E731
    ts = sorted(set.intersection(*[set(c["diff"]) for c in cells])) if cells else []
    mean_diff = {t: float(np.mean([c["diff"][t] for c in cells])) for t in ts}
    mean_diff_live = {t: float(np.mean([c["diff_live"][t] for c in cells])) for t in ts}
    verdict = dict(
        K1=len(cells) == 4 and all(0.005 <= c["dropped_share"] <= 0.03 and au(c) >= 0.8 for c in cells),
        K2=len(cells) == 4 and abs(mean_diff["0.9"]) <= 1,
        K3=len(cells) == 4 and all(c["q90_pred_mean"]["clean"] < c["q90_pred_mean"]["nc5"] for c in cells),
        K4=sum(c["diff_live"]["0.9"] <= c["diff"]["0.9"] for c in cells) >= 3,
        K5=len(cells) == 4 and all(c["s91_nc5_q90"] is not None and abs(c["loss"]["nc5"]["0.9"] - c["s91_nc5_q90"]) <= 0.5
                                   for c in cells))
    return dict(note="cascade2 transfer model; diff = clean minus nc5 mean pinball loss (days, negative = clean "
                     "better), both refit on the 2026-11-16 pull; all = completed test-year rows, live = those whose "
                     "status is not dead; 3 seeds", cells=cells, mean_diff=mean_diff, mean_diff_live=mean_diff_live,
                austin_share_of_dropped=[au(c) for c in cells], held=verdict)


def len_summary(path, clean_path, stamp96_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 97: cpin_es3_nc5_stamp (refit), _stamp_len and _stamp_long (this file) against session 95's
    cpin_es3_nc5_clean (clean_path) and session 96's cpin_es3_nc5_stamp (stamp96_path); predictions L0 to L5."""
    R, C, S = json.load(open(path)), json.load(open(clean_path)), json.load(open(stamp96_path))
    q = lambda r: r["test_loss"]["0.9"]  # noqa: E731
    pm = lambda r: float(np.mean([v["mean"] for v in r["test_pred_q90"].values()]))  # noqa: E731
    cells = []
    for h in held:
        for Y in years:
            k = lambda v: f"{h} {Y} {v}"  # noqa: E731
            st, ln, lg = R.get(k("cpin_es3_nc5_stamp")), R.get(k("cpin_es3_nc5_stamp_len")), R.get(k("cpin_es3_nc5_stamp_long"))
            cl, s96 = C.get(k("cpin_es3_nc5_clean")), S.get(k("cpin_es3_nc5_stamp"))
            if None in (st, ln, lg, cl, s96):
                continue
            nonstamp = cl["n_dead_dropped"] - st["n_dead_dropped"]
            ps = lambda a, b: [y - x for x, y in zip(a["test_loss_per_seed"]["0.9"], b["test_loss_per_seed"]["0.9"])]  # noqa: E731
            cells.append(dict(
                held=h, year=Y, n_nonstamp_dead=nonstamp, len_matched=ln["len_matched"],
                len_short_share=ln["len_matched"]["n_short"] / nonstamp,
                n_long_dropped=lg["n_dead_dropped"] - st["n_dead_dropped"],
                long_share_of_nonstamp=(lg["n_dead_dropped"] - st["n_dead_dropped"]) / nonstamp,
                q90=dict(stamp=q(st), stamp96=q(s96), clean=q(cl), stamp_len=q(ln), stamp_long=q(lg)),
                stamp_refit_minus_s96=q(st) - q(s96),
                len_minus_stamp=q(ln) - q(st), long_minus_stamp=q(lg) - q(st), clean_minus_stamp=q(cl) - q(st),
                clean_minus_stamp_s96=q(cl) - q(s96),
                len_minus_stamp_per_seed=ps(st, ln), long_minus_stamp_per_seed=ps(st, lg),
                q90_pred_mean=dict(stamp=pm(st), clean=pm(cl), stamp_len=pm(ln), stamp_long=pm(lg)),
                rounds={v: [x["0.9"] for x in r["rounds"].values()]
                        for v, r in (("stamp", st), ("stamp_len", ln), ("stamp_long", lg))}))
    sf = [c for c in cells if c["held"] == "sf"]
    se = [c for c in cells if c["held"] == "seattle"]
    full = len(cells) == len(held) * len(years)
    pred = dict(
        L0=full and all(abs(c["stamp_refit_minus_s96"]) <= 0.05 for c in cells),
        L1=full and all(c["len_short_share"] < 0.01 for c in cells),
        L2=full and all(c["len_minus_stamp"] >= 1.0 for c in se),
        L3=full and float(np.mean([c["len_minus_stamp"] for c in sf])) < 0,
        L4=full and all(c["long_minus_stamp"] >= 0.75 * c["clean_minus_stamp_s96"] for c in se),
        L5=full and all(c["long_share_of_nonstamp"] <= 0.40 for c in cells))
    mean = lambda f: float(np.mean([c[f] for c in cells])) if cells else None  # noqa: E731
    return dict(note="session 97: stamp, stamp_len, stamp_long refit on the 2026-11-16 pull; clean from session 95, "
                     "stamp96 from session 96 (same row counts); L4 uses session 96's clean minus stamp as pre-registered",
                cells=cells, predictions=pred,
                mean=dict(len_minus_stamp=mean("len_minus_stamp"), long_minus_stamp=mean("long_minus_stamp"),
                          clean_minus_stamp=mean("clean_minus_stamp")))


TSEL = ("cpin_es3_nc3", "cpin_es3_nc5", "cpin_es3_nc5_stamp", "cpin_es3_nc5_stamp_len")
TSEL_PRIOR = {"cpin_es3_nc3": ("rounds_score_sweep_i2c.json", "cpin_es3_nc3"),
              "cpin_es3_nc5": ("rounds_score_clean_i2c.json", "cpin_es3_nc5"),
              "cpin_es3_nc5_stamp": ("rounds_score_len_i2c.json", "cpin_es3_nc5_stamp"),
              "cpin_es3_nc5_stamp_len": ("rounds_score_len_i2c.json", "cpin_es3_nc5_stamp_len")}


def target_sel_summary(path, res_dir, held=("sf", "seattle"), years=(2021, 2022), cands=TSEL, tau="0.9"):
    """Session 98: per cell, the candidate with the lowest target-Y-3 score (tgt_loss: completed by D; tgt_closs:
    censored, all Y-3 rows), its test q0.9 against each fixed rule and the oracle; predictions G0 to G4."""
    R = json.load(open(path))
    prior = {v: json.load(open(os.path.join(res_dir, f))) for v, (f, _) in TSEL_PRIOR.items()
             if os.path.exists(os.path.join(res_dir, f))}
    cells = []
    for h in held:
        for Y in years:
            rs = {v: R.get(f"{h} {Y} {v}") for v in cands}
            if any(r is None or "tgt_loss" not in r for r in rs.values()):
                continue
            test = {v: r["test_loss"][tau] for v, r in rs.items()}
            tl = {v: r["tgt_loss"][tau] for v, r in rs.items()}
            tc = {v: r["tgt_closs"][tau] for v, r in rs.items()}
            pick, pick_c = min(tl, key=tl.get), min(tc, key=tc.get)
            oracle = min(test, key=test.get)
            # per seed: pick by that seed's target score, score that seed's test loss
            n_s = len(rs[cands[0]]["test_loss_per_seed"][tau])
            ps = [min(cands, key=lambda v: rs[v]["tgt_loss_per_seed"][tau][s]) for s in range(n_s)]
            refit = {}
            for v, (f, key) in TSEL_PRIOR.items():
                old = prior.get(v, {}).get(f"{h} {Y} {key}")
                refit[v] = None if old is None else test[v] - old["test_loss"][tau]
            cells.append(dict(held=h, year=Y, test_q90=test, tgt_loss_q90=tl, tgt_closs_q90=tc,
                              tgt_n=rs[cands[0]]["tgt_n"], tgt_n_open=rs[cands[0]]["tgt_n_open"],
                              pick=pick, pick_closs=pick_c, oracle=oracle,
                              regret=test[pick] - test[oracle], regret_closs=test[pick_c] - test[oracle],
                              pick_per_seed=ps,
                              pick_per_seed_test=[rs[v]["test_loss_per_seed"][tau][s] for s, v in enumerate(ps)],
                              refit_minus_prior=refit))
    full = len(cells) == len(held) * len(years)
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    fixed_mean = {v: m([c["test_q90"][v] for c in cells]) for v in cands}
    sel_mean = m([c["test_q90"][c["pick"]] for c in cells])
    sel_c_mean = m([c["test_q90"][c["pick_closs"]] for c in cells])
    five = set(cands) - {"cpin_es3_nc3"}
    sf = [c for c in cells if c["held"] == "sf"]
    se = [c for c in cells if c["held"] == "seattle"]
    pred = dict(
        G0=full and all(x is not None and abs(x) <= 0.05 for c in cells for x in c["refit_minus_prior"].values()),
        G1=full and all(c["pick"] == "cpin_es3_nc3" for c in sf) and all(c["pick"] in five for c in se),
        G2=full and all(sel_mean < x for x in fixed_mean.values()),
        G3=full and m([c["regret"] for c in cells]) <= 0.5,
        G4=full and all(c["pick_closs"] in five for c in cells))
    return dict(note="session 98: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds (days); pick = the "
                     "candidate source rule with the lowest q0.9 pinball loss on the target city's own Y-3 permits "
                     "completed by D = 1 January Y; pick_closs = lowest censored loss on all its Y-3 permits",
                cands=list(cands), cells=cells, fixed_mean=fixed_mean, selected_mean=sel_mean,
                selected_closs_mean=sel_c_mean, mean_regret=m([c["regret"] for c in cells]),
                mean_regret_closs=m([c["regret_closs"] for c in cells]), predictions=pred)


TFOL_SELECTORS = ("k3_loss", "k3_ipcw", "k5_loss", "k5_ipcw", "k6_loss", "k6_ipcw")
TFOL_PRIMARY = "k6_loss"  # session 99: fixed before any run


def target_follow_summary(path, prior_path, held=("sf", "seattle"), years=(2021, 2022), cands=TSEL, tau="0.9"):
    """Session 99: per cell, the candidate picked by each target score (the target's own Y-k permits, k = 3, 5, 6,
    completed by D, plain or IPCW-weighted pinball), its test q0.9 against each fixed rule and the oracle; the
    refits against session 98's (prior_path); predictions F0 to F5. Primary selector TFOL_PRIMARY."""
    R, P = json.load(open(path)), json.load(open(prior_path))
    cells = []
    for h in held:
        for Y in years:
            rs = {v: R.get(f"{h} {Y} {v}") for v in cands}
            if any(r is None or "tgt_k" not in r for r in rs.values()):
                continue
            test = {v: r["test_loss"][tau] for v, r in rs.items()}
            oracle = min(test, key=test.get)
            score = {sel: {v: r["tgt_k"][sel[1]][sel[3:]][tau] for v, r in rs.items()} for sel in TFOL_SELECTORS}
            pick = {sel: min(sc, key=sc.get) for sel, sc in score.items()}
            n_s = len(rs[cands[0]]["test_loss_per_seed"][tau])
            seed_pick = {sel: [min(cands, key=lambda v: rs[v]["tgt_k"][sel[1]][sel[3:] + "_per_seed"][tau][s])
                               for s in range(n_s)] for sel in TFOL_SELECTORS}
            refit = {v: test[v] - P[f"{h} {Y} {v}"]["test_loss"][tau] for v in cands if f"{h} {Y} {v}" in P}
            k3 = {v: rs[v]["tgt_k"]["3"]["loss"][tau] - P[f"{h} {Y} {v}"]["tgt_loss"][tau]
                  for v in cands if f"{h} {Y} {v}" in P}
            cells.append(dict(held=h, year=Y, test_q90=test, oracle=oracle, score=score, pick=pick,
                              regret={sel: test[p] - test[oracle] for sel, p in pick.items()},
                              pick_per_seed=seed_pick,
                              nc5_minus_nc3={sel: sc["cpin_es3_nc5"] - sc["cpin_es3_nc3"] for sel, sc in score.items()},
                              tgt_n={k: rs[cands[0]]["tgt_k"][k]["n"] for k in ("3", "5", "6")},
                              tgt_n_open={k: rs[cands[0]]["tgt_k"][k]["n_open"] for k in ("3", "5", "6")},
                              refit_minus_prior=refit, k3_minus_prior=k3))
    full = len(cells) == len(held) * len(years)
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    fixed_mean = {v: m([c["test_q90"][v] for c in cells]) for v in cands}
    sel_mean = {sel: m([c["test_q90"][c["pick"][sel]] for c in cells]) for sel in TFOL_SELECTORS}
    regret = {sel: m([c["regret"][sel] for c in cells]) for sel in TFOL_SELECTORS}
    five = set(cands) - {"cpin_es3_nc3"}
    sf = [c for c in cells if c["held"] == "sf"]
    se = [c for c in cells if c["held"] == "seattle"]
    P1 = TFOL_PRIMARY
    pred = dict(
        F0=full and all(abs(x) <= 0.05 for c in cells for d in (c["refit_minus_prior"], c["k3_minus_prior"])
                        for x in d.values()) and all(len(c["refit_minus_prior"]) == len(cands) for c in cells),
        F1=full and all(c["pick"][P1] == "cpin_es3_nc3" for c in sf) and all(c["pick"][P1] in five for c in se),
        F2=full and all(sel_mean[P1] < x for x in fixed_mean.values()),
        F3=full and all(c["nc5_minus_nc3"]["k6_loss"] < c["nc5_minus_nc3"]["k3_loss"] for c in se),
        F4=full and any(c["pick"]["k3_ipcw"] in five for c in se),
        F5=full and regret[P1] <= 1.0)
    return dict(note="session 99: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds (days); selector "
                     "kK_loss = lowest q0.9 pinball on the target city's own Y-K permits completed by D = 1 January Y; "
                     "kK_ipcw = the same, weighted by 1/G(y) (transfer.ipcw_completed on that cohort)",
                primary=P1, cands=list(cands), cells=cells, fixed_mean=fixed_mean, selected_mean=sel_mean,
                mean_regret=regret, predictions=pred)


REP_SELECTORS = ("k3_loss", "k5_loss", "k6_loss", "k8_loss", "k3_ipcw", "k6_ipcw")
REP_NEW = (("sf", 2019), ("sf", 2020), ("seattle", 2019), ("seattle", 2020))  # session 100: new test years
REP_AUSTIN = (("austin", 2021), ("austin", 2022))  # session 100: a third target city
REP_OLD = (("sf", 2021), ("sf", 2022), ("seattle", 2021), ("seattle", 2022))  # session 99's cells


def _rep_cell(R, h, Y, cands, tau="0.9"):
    """Session 100: one cell's oracle, each selector's pick and regret (selectors whose cohort is absent skipped)."""
    rs = {v: R.get(f"{h} {Y} {v}") for v in cands}
    if any(r is None or "tgt_k" not in r for r in rs.values()):
        return None
    test = {v: r["test_loss"][tau] for v, r in rs.items()}
    oracle = min(test, key=test.get)
    ks = set(rs[cands[0]]["tgt_k"])
    score = {sel: {v: r["tgt_k"][sel[1]][sel[3:]][tau] for v, r in rs.items()}
             for sel in REP_SELECTORS if sel[1] in ks}
    score = {sel: sc for sel, sc in score.items() if all(x is not None for x in sc.values())}
    pick = {sel: min(sc, key=sc.get) for sel, sc in score.items()}
    n_s = len(rs[cands[0]]["test_loss_per_seed"][tau])
    seed_pick = {sel: [min(cands, key=lambda v: rs[v]["tgt_k"][sel[1]][sel[3:] + "_per_seed"][tau][s])
                       for s in range(n_s)] for sel in score}
    return dict(held=h, year=Y, test_q90=test, oracle=oracle, score=score, pick=pick, pick_per_seed=seed_pick,
                regret={sel: test[p] - test[oracle] for sel, p in pick.items()},
                nc5_minus_nc3={sel: sc["cpin_es3_nc5"] - sc["cpin_es3_nc3"] for sel, sc in score.items()},
                test_nc5_minus_nc3=test["cpin_es3_nc5"] - test["cpin_es3_nc3"],
                tgt_n={k: rs[cands[0]]["tgt_k"][k]["n"] for k in sorted(ks)},
                tgt_n_open={k: rs[cands[0]]["tgt_k"][k]["n_open"] for k in sorted(ks)},
                n_test=rs[cands[0]]["n_test"])


def replicate_summary(path, old_path, cands=TSEL, tau="0.9"):
    """Session 100: does session 99's target-cohort selector (k6_loss: the held city's own Y-6 permits completed
    by D) survive new cells? New: SF and Seattle at test years 2019 and 2020, Austin held out at 2021 and 2022
    (this file); old: session 99's four cells (old_path). Predictions H1 to H6, fixed before any run."""
    R, O = json.load(open(path)), json.load(open(old_path))
    new = [c for c in (_rep_cell(R, h, Y, cands, tau) for h, Y in REP_NEW) if c]
    au = [c for c in (_rep_cell(R, h, Y, cands, tau) for h, Y in REP_AUSTIN) if c]
    old = [c for c in (_rep_cell(O, h, Y, cands, tau) for h, Y in REP_OLD) if c]
    m = lambda xs: float(np.mean(xs)) if xs else None  # noqa: E731
    five = set(cands) - {"cpin_es3_nc3"}

    def agg(cells):
        sels = [s for s in REP_SELECTORS if cells and all(s in c["pick"] for c in cells)]
        return dict(n=len(cells), fixed_mean={v: m([c["test_q90"][v] for c in cells]) for v in cands},
                    oracle_mean=m([c["test_q90"][c["oracle"]] for c in cells]),
                    selected_mean={s: m([c["test_q90"][c["pick"][s]] for c in cells]) for s in sels},
                    mean_regret={s: m([c["regret"][s] for c in cells]) for s in sels},
                    hits={s: sum(c["pick"][s] == c["oracle"] for c in cells) for s in sels},
                    fixed_regret={v: m([c["test_q90"][v] - c["test_q90"][c["oracle"]] for c in cells]) for v in cands})
    A_new, A_au, A_all = agg(new), agg(au), agg(new + au + old)
    full = len(new) == 4 and len(au) == 2 and len(old) == 4
    sfn = [c for c in new if c["held"] == "sf"]
    sen = [c for c in new if c["held"] == "seattle"]
    P = "k6_loss"
    pred = dict(
        H1=len(new) == 4 and all(c["oracle"] == "cpin_es3_nc3" for c in sfn) and all(c["oracle"] in five for c in sen),
        H2=len(new) == 4 and A_new["hits"].get(P, 0) >= 3,
        H3=len(new) == 4 and A_new["mean_regret"].get(P, 9e9) <= 1.0,
        H4=len(new) == 4 and all(A_new["selected_mean"][P] <= x for x in A_new["fixed_mean"].values()),
        H5=len(au) == 2 and A_au["mean_regret"].get(P, 9e9) <= 1.0,
        H6=full and A_all["hits"].get(P, 0) >= 8 and A_all["mean_regret"][P] < A_all["mean_regret"]["k3_loss"]
           and all(A_all["mean_regret"][P] < x for x in A_all["fixed_regret"].values()))
    return dict(note="session 100: cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test "
                     "rows (days); kK_loss = lowest q0.9 pinball on the held city's own Y-K permits completed by "
                     "D = 1 January Y, kK_ipcw the same weighted by 1/G(y); old cells from session 99",
                primary=P, cands=list(cands), new=new, austin=au, old=old, agg_new=A_new, agg_austin=A_au,
                agg_all=A_all, predictions=pred)


def stamp_summary(path, clean_path, sweep_path, held=("sf", "seattle"), years=(2021, 2022)):
    """Session 96: cpin_es3_nc5_stamp and cpin_es3_nc3_clean (this file) against session 95's cpin_es3_nc5 and
    cpin_es3_nc5_clean (clean_path) and session 92's cpin_es3_nc3 (sweep_path), all on feeds whose row counts
    match; per cell the q0.9 loss on completed test rows, the rows each rule drops, the mean q0.9 prediction,
    rounds; predictions T1 to T3, C1, C2."""
    R, C, W = json.load(open(path)), json.load(open(clean_path)), json.load(open(sweep_path))
    pm = lambda r: float(np.mean([p["mean"] for p in r["test_pred_q90"].values()]))  # noqa: E731
    q = lambda r: r["test_loss"]["0.9"]  # noqa: E731
    cells = []
    for h in held:
        for Y in years:
            k = lambda v: f"{h} {Y} {v}"  # noqa: E731
            st, c3 = R.get(k("cpin_es3_nc5_stamp")), R.get(k("cpin_es3_nc3_clean"))
            n5, cl, n3 = C.get(k("cpin_es3_nc5")), C.get(k("cpin_es3_nc5_clean")), W.get(k("cpin_es3_nc3"))
            if not all((st, c3, n5, cl, n3)):
                continue
            cells.append(dict(
                held=h, year=Y, n_dropped=dict(stamp=st["n_dead_dropped"], clean=cl["n_dead_dropped"],
                                               nc3_clean=c3["n_dead_dropped"]),
                stamp_share_of_clean=st["n_dead_dropped"] / cl["n_dead_dropped"],
                dropped_by_city=dict(stamp=st["n_dead_by_city"], nc3_clean=c3["n_dead_by_city"]),
                q90=dict(nc5=q(n5), clean=q(cl), stamp=q(st), nc3=q(n3), nc3_clean=q(c3)),
                q90_live=dict(stamp=st.get("test_loss_live", {}).get("0.9"),
                              nc3_clean=c3.get("test_loss_live", {}).get("0.9")),
                stamp_minus_nc5=q(st) - q(n5), clean_minus_stamp=q(cl) - q(st),
                nc3_clean_minus_nc3=q(c3) - q(n3), nc3_clean_minus_nc5_clean=q(c3) - q(cl),
                stamp_minus_nc5_per_seed=[y - x for x, y in zip(n5["test_loss_per_seed"]["0.9"],
                                                                 st["test_loss_per_seed"]["0.9"])],
                nc3_clean_minus_nc3_per_seed=[y - x for x, y in zip(n3["test_loss_per_seed"]["0.9"],
                                                                     c3["test_loss_per_seed"]["0.9"])],
                q90_pred_mean=dict(nc5=pm(n5), clean=pm(cl), stamp=pm(st), nc3_clean=pm(c3)),
                q90_rounds={v: float(np.mean([x["0.9"] for x in r["rounds"].values()]))
                            for v, r in (("nc5", n5), ("clean", cl), ("stamp", st), ("nc3", n3), ("nc3_clean", c3))}))
    se = [c for c in cells if c["held"] == "seattle"]
    sf = [c for c in cells if c["held"] == "sf"]
    full = len(cells) == 4
    verdict = dict(
        T1=full and all(0.75 <= c["stamp_share_of_clean"] <= 0.95 for c in cells),
        T2=full and all(c["stamp_minus_nc5"] >= 1.0 for c in se),
        T3=full and all(abs(c["clean_minus_stamp"]) < 1.0 for c in cells),
        C1=full and all(c["nc3_clean_minus_nc5_clean"] < 0 for c in sf) and all(c["nc3_clean_minus_nc5_clean"] > 0 for c in se),
        C2=full and abs(float(np.mean([c["nc3_clean_minus_nc3"] for c in cells]))) <= 1.5)
    mean = lambda f: float(np.mean([c[f] for c in cells])) if cells else None  # noqa: E731
    return dict(note="cascade2 transfer model, q0.9 mean pinball loss over 3 seeds on completed test-year rows (days); "
                     "nc5 and clean from session 95, nc3 from session 92, stamp and nc3_clean refit by session 96 on "
                     "feeds with the same row counts", cells=cells,
                mean=dict(stamp_minus_nc5=mean("stamp_minus_nc5"), clean_minus_stamp=mean("clean_minus_stamp"),
                          nc3_clean_minus_nc3=mean("nc3_clean_minus_nc3"),
                          nc3_clean_minus_nc5_clean=mean("nc3_clean_minus_nc5_clean")),
                held=verdict)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--held", nargs="+", default=["austin", "sf", "seattle"])
    ap.add_argument("--test-years", nargs="+", type=int, default=[2021, 2022])
    ap.add_argument("--variants", nargs="+", default=list(VARIANTS), choices=VARIANTS)
    ap.add_argument("--seeds", type=int, default=3)
    ap.add_argument("--floor", type=float, default=0.05, help="IPCW weight floor on G (ipcw_* variants)")
    ap.add_argument("--out-name", help="results file name (default rounds_[score_]i2c.json)")
    ap.add_argument("--score", action="store_true", help="also score cascade2 on the held-out test year")
    ap.add_argument("--summarise-ipcw", help="write results/<name>_summary.json from this results file (session 88)")
    ap.add_argument("--summarise-cens", help="session 89: write results/<name>_summary.json from this file and "
                    "results/rounds_score_ipcw_i2c.json")
    ap.add_argument("--summarise", action="store_true", help="write results/rounds_summary.json from saved files")
    ap.add_argument("--summarise-cpin", help="session 90: write results/<name>_summary.json from this file and "
                    "results/rounds_score_ipcw_i2c.json")
    ap.add_argument("--keep-open", action="store_true", help="session 91: load never-completed permits (cpin_* only)")
    ap.add_argument("--pulled", default=datetime.date.today().isoformat(), help="pull date (censored test windows)")
    ap.add_argument("--summarise-nc", help="session 91: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-sweep", help="session 92: write results/<name>_summary.json from this file")
    ap.add_argument("--status-dir", help="session 95: directory of <city>_status.csv (status_pull.py)")
    ap.add_argument("--summarise-clean", help="session 95: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-ncq", help="session 93: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-len", help="session 97: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-stamp", help="session 96: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-tsel", help="session 98: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-rep", help="session 100: write results/<name>_summary.json from this file")
    ap.add_argument("--summarise-tfol", help="session 99: write results/<name>_summary.json from this file")
    a = ap.parse_args()
    res_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "results")
    if a.summarise_rep:
        s = replicate_summary(a.summarise_rep, os.path.join(res_dir, "rounds_score_tfol_i2c.json"))
        json.dump(s, open(a.summarise_rep.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps({k: s[k] for k in ("agg_new", "agg_austin", "agg_all", "predictions")}, indent=1))
        for c in s["new"] + s["austin"] + s["old"]:
            print(c["held"], c["year"], c["oracle"], c["pick"], {k: round(v, 2) for k, v in c["test_q90"].items()},
                  {k: round(v, 2) for k, v in c["nc5_minus_nc3"].items()}, c["tgt_n"], c["tgt_n_open"])
        sys.exit()
    if a.summarise_tfol:
        s = target_follow_summary(a.summarise_tfol, os.path.join(res_dir, "rounds_score_tsel_i2c.json"))
        json.dump(s, open(a.summarise_tfol.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps({k: s[k] for k in ("fixed_mean", "selected_mean", "mean_regret", "predictions")}, indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], c["oracle"], c["pick"], {k: round(v, 2) for k, v in c["nc5_minus_nc3"].items()},
                  c["tgt_n"], c["tgt_n_open"], {k: round(v, 3) for k, v in c["refit_minus_prior"].items()})
        sys.exit()
    if a.summarise_tsel:
        s = target_sel_summary(a.summarise_tsel, res_dir)
        json.dump(s, open(a.summarise_tsel.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps({k: s[k] for k in ("fixed_mean", "selected_mean", "selected_closs_mean", "mean_regret",
                                            "mean_regret_closs", "predictions")}, indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], c["pick"], c["pick_closs"], c["oracle"], round(c["regret"], 2),
                  {k: round(v, 2) for k, v in c["test_q90"].items()}, {k: round(v, 2) for k, v in c["tgt_loss_q90"].items()},
                  {k: round(v, 2) for k, v in c["tgt_closs_q90"].items()}, c["pick_per_seed"], c["refit_minus_prior"])
        sys.exit()
    if a.summarise_len:
        s = len_summary(a.summarise_len, os.path.join(res_dir, "rounds_score_clean_i2c.json"),
                        os.path.join(res_dir, "rounds_score_stamp_i2c.json"))
        json.dump(s, open(a.summarise_len.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(pred=s["predictions"], mean=s["mean"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], c["n_nonstamp_dead"], c["len_matched"], c["n_long_dropped"],
                  {k: round(v, 2) for k, v in c["q90"].items()}, round(c["len_minus_stamp"], 2),
                  round(c["long_minus_stamp"], 2), [round(x, 2) for x in c["len_minus_stamp_per_seed"]],
                  [round(x, 2) for x in c["long_minus_stamp_per_seed"]])
        sys.exit()
    if a.summarise_stamp:
        s = stamp_summary(a.summarise_stamp, os.path.join(res_dir, "rounds_score_clean_i2c.json"),
                          os.path.join(res_dir, "rounds_score_sweep_i2c.json"))
        json.dump(s, open(a.summarise_stamp.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean"], held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], c["n_dropped"], round(c["stamp_share_of_clean"], 3),
                  {k: round(v, 2) for k, v in c["q90"].items()}, c["q90_rounds"])
        sys.exit(0)
    if a.summarise_clean:
        s = clean_summary(a.summarise_clean, os.path.join(res_dir, "rounds_score_nc_i2c.json"))
        json.dump(s, open(a.summarise_clean.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_diff"], live=s["mean_diff_live"], au=s["austin_share_of_dropped"],
                              held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], c["n_dropped"], round(c["dropped_share"], 4), c["dropped_by_city"],
                  {k: round(v, 2) for k, v in c["diff"].items()}, {k: round(v, 2) for k, v in c["diff_live"].items()},
                  {k: round(v, 1) for k, v in c["q90_pred_mean"].items()}, c["s91_nc5_q90"], c["loss"]["nc5"]["0.9"])
        sys.exit()
    if a.summarise_ncq:
        s = ncq_summary(a.summarise_ncq, os.path.join(res_dir, "rounds_score_sweep_i2c.json"),
                        os.path.join(res_dir, "rounds_score_nc_i2c.json"),
                        os.path.join(res_dir, "rounds_score_ipcw_i2c.json"))
        json.dump(s, open(a.summarise_ncq.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], sf=s["sf_q90_mean"], best=s["best_fixed_q90"],
                              thr=s["ncq_thresholds_days"], rep=s["replication_max_abs_q90_diff"],
                              n_rep=s["n_replicated"], held=s["held"]), indent=1))
        sys.exit()
    if a.summarise_sweep:
        s = sweep_summary(a.summarise_sweep, os.path.join(res_dir, "rounds_score_ipcw_i2c.json"),
                          os.path.join(res_dir, "rounds_score_nc_i2c.json"))
        json.dump(s, open(a.summarise_sweep.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(s["mean_change"], indent=1), s["best_fixed_q90"], s["mean_regret_q90"], s["held"])
        for c in s["cells"]:
            print(c["held"], c["year"], c["selected"], c["oracle"], round(c["regret_q90"], 2),
                  {v: round(x["0.9"], 2) for v, x in c["change"].items()}, {v: round(x, 1) for v, x in c["sel_q90"].items()})
        sys.exit()
    if a.summarise_nc:
        s = nc_summary(a.summarise_nc, os.path.join(res_dir, "rounds_score_ipcw_i2c.json"))
        json.dump(s, open(a.summarise_nc.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], counts=s["counts"], held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {v: {t: round(x, 2) for t, x in d.items()} for v, d in c["change"].items()},
                  {v: {t: round(x, 1) for t, x in (d or {}).items()} for v, d in c["closs_all"].items()},
                  {v: round(x, 1) for v, x in c["q90_rounds"].items()}, {v: round(x) for v, x in c["q90_pred_max"].items()})
        sys.exit()
    if a.summarise_cpin:
        s = cpin_summary(a.summarise_cpin, os.path.join(res_dir, "rounds_score_ipcw_i2c.json"))
        json.dump(s, open(a.summarise_cpin.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], counts=s["counts"], held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {v: {t: round(x, 2) for t, x in d.items()} for v, d in c["change"].items()},
                  {v: round(x, 1) for v, x in c["q90_rounds"].items()}, {v: round(x) for v, x in c["q90_pred_max"].items()})
        sys.exit()
    if a.summarise_cens:
        s = cens_summary(a.summarise_cens, os.path.join(res_dir, "rounds_score_ipcw_i2c.json"))
        json.dump(s, open(a.summarise_cens.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], sw=s["sf_seattle_q90_mean_change"], counts=s["counts"],
                              held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {v: {t: round(x, 2) for t, x in d.items()} for v, d in c["change"].items()},
                  {v: round(x, 1) for v, x in c["q90_rounds"].items()}, {v: round(x, 2) for v, x in c["recovered_q90"].items()})
        sys.exit()
    if a.summarise_ipcw:
        s = ipcw_summary(a.summarise_ipcw)
        json.dump(s, open(a.summarise_ipcw.replace(".json", "_summary.json"), "w"), indent=1)
        print(json.dumps(dict(mean=s["mean_change"], counts=s["counts"], held=s["held"]), indent=1))
        for c in s["cells"]:
            print(c["held"], c["year"], {v: {t: round(x, 2) for t, x in d.items()} for v, d in c["change"].items()},
                  {v: round(x, 1) for v, x in c["q90_rounds"].items()}, round(c.get("ipcw_cut_recovered_share_q90", float("nan")), 2))
        sys.exit()
    if a.summarise:
        s = summarise(os.path.join(res_dir, "rounds_i2c.json"), res_dir)
        json.dump(s, open(os.path.join(res_dir, "rounds_summary.json"), "w"), indent=1)
        print(json.dumps(s["by_variant"], indent=1), s["spearman_log_round_ratio_vs_q90_loss_change"])
        for c in s["cells"]:
            print(c)
        sys.exit()
    cities = [c for c in transfer.CITIES if c != "chicago" and os.path.exists(os.path.join(a.data_dir, f"{c}.csv"))]
    keep_open = any(v.startswith("cpin_") for v in a.variants) and a.keep_open
    frames = {c: transfer.frame(os.path.join(a.data_dir, f"{c}.csv"), "i2c", "cascade2", keep_open=keep_open)[0]
              for c in cities}
    if a.status_dir:
        frames = {c: attach_status(d, os.path.join(a.status_dir, f"{c}_status.csv")) for c, d in frames.items()}
    elif set(DEAD_DROP) & set(a.variants):
        raise SystemExit(f"{sorted(set(DEAD_DROP) & set(a.variants))} need --status-dir")
    pulled = datetime.date.fromisoformat(a.pulled)
    out_path = os.path.join(res_dir, a.out_name or ("rounds_score_i2c.json" if a.score else "rounds_i2c.json"))
    res = json.load(open(out_path)) if os.path.exists(out_path) else {}
    for h in a.held:
        for Y in a.test_years:
            for v in a.variants:
                res[f"{h} {Y} {v}"] = rounds(frames, h, Y, v, a.seeds, a.score, a.floor, pulled)
                print(h, Y, v, res[f"{h} {Y} {v}"], flush=True)
                json.dump(res, open(out_path, "w"), indent=1)

