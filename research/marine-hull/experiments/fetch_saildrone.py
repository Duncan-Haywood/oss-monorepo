"""Fetch fielded Saildrone tracks and winds (NOAA PMEL ERDDAP, CC0) and thin them to 10-minute blocks.
Datasets: saildrone_west_coast_survey_2018 (NOAA NWFSC, Jul-Sep 2018) and _2019 (eight drones, Jul-Sep 2019), 60 s samples:
position, SOG, COG, HDG, and the drone's own true-wind components UWND_MEAN, VWND_MEAN (m/s). Per drone and 10-minute block
we keep the mean position, mean SOG, circular-mean COG/HDG and mean wind components, plus the sample count.
Run: python3 experiments/fetch_saildrone.py   (about 140 MB of download; writes experiments/data/saildrone_10min.csv.gz)"""
import csv, gzip, io, math, urllib.request
B = "https://data.pmel.noaa.gov/pmel/erddap/tabledap"
Q = "time,latitude,longitude,trajectory,SOG,COG,HDG,UWND_MEAN,VWND_MEAN&orderBy(%22trajectory,time%22)"
out = []
for ds in ("saildrone_west_coast_survey_2018", "saildrone_west_coast_survey_2019"):
    raw = urllib.request.urlopen(f"{B}/{ds}.csv?{Q}", timeout=300).read().decode()
    rd = csv.reader(io.StringIO(raw)); next(rd); next(rd)
    blk, key = [], None
    def flush():
        if not blk: return
        n = len(blk)
        def m(i): return sum(r[i] for r in blk) / n
        def cm(i): return math.degrees(math.atan2(sum(math.sin(math.radians(r[i])) for r in blk), sum(math.cos(math.radians(r[i])) for r in blk))) % 360
        out.append((ds[-4:], int(key[0]), key[1], round(m(0), 5), round(m(1), 5), round(m(2), 3), round(cm(3), 1), round(cm(4), 1), round(m(5), 2), round(m(6), 2), n))
    for t, la, lo, tr, sog, cog, hdg, u, v in rd:
        try: vals = [float(la), float(lo), float(sog), float(cog), float(hdg), float(u), float(v)]
        except ValueError: continue
        if any(x != x for x in vals): continue
        k = (float(tr), t[:15])          # 10-minute block: yyyy-mm-ddThh:m
        if k != key: flush(); blk.clear(); key = k
        blk.append(vals)
    flush()
with gzip.open("experiments/data/saildrone_10min.csv.gz", "wt", newline="") as f:
    w = csv.writer(f); w.writerow(["year", "drone", "block", "lat", "lon", "sog", "cog", "hdg", "u", "v", "n"]); w.writerows(out)
print(len(out), "blocks")
