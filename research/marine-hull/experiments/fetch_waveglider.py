"""Milestone 6p data: a fielded Wave Glider's through-water speed against measured sea state.

Vehicle: Liquid Robotics Wave Glider "Honey Badger" (G3), MAGI mission (UT Austin, T. Villareal), Hawaii to about 30 N,
20 May to 4 Nov 2015. Telemetry from NOAA SWFSC ERD ERDDAP (coastwatch.pfeg.noaa.gov, dataset LiquidR_HBG3_2015_telemetry,
"may be used and redistributed for free"): time, position, water_speed (knots, through the water, so ocean current is
not in it), about every 5 minutes.
Sea state: NDBC historical standard-meteorological files for 2015 (WVHT significant wave height m, DPD dominant period s,
APD average period s), hourly or half-hourly, at the open-ocean and nearshore Hawaii buoys below (positions from NDBC
station_table.txt, read 2026-11-11).
Output: experiments/data/waveglider_hourly.csv, one row per UTC hour with at least 6 telemetry samples:
hour, lat, lon, mean water speed (m/s), sample count, nearest buoy with a valid wave record within +-1 h, its distance (km),
WVHT, DPD, APD.
Second output, experiments/data/ndbc_waves_2024.csv: hourly WVHT and DPD in January and July 2024 at the twelve open-water
buoys of milestone 5k (fetch_ndbc_buoys.py, same positions), for the km/day comparison against 6o's wind drone and the
solar ceiling.
Run: python3 experiments/fetch_waveglider.py   (about 6 MB of download, under a minute)"""
import csv, gzip, io, math, urllib.request, datetime as dt, statistics

TEL = ("https://coastwatch.pfeg.noaa.gov/erddap/tabledap/LiquidR_HBG3_2015_telemetry.csv?"
       "time,latitude,longitude,water_speed&time%3E=2015-05-01")
BUOYS = {"51000": (23.534, -153.752), "51100": (23.558, -153.900), "51001": (24.475, -162.030), "51101": (24.340, -162.073),
         "51002": (17.070, -157.755), "51003": (19.151, -160.617), "51004": (17.504, -152.197),
         "51206": (19.779, -154.970), "51205": (21.018, -156.421), "51208": (22.285, -159.574)}
KN = 0.514444


def km(a, b):
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dl = math.radians(b[1] - a[1])
    return 6371.0 * math.acos(min(1.0, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)))


PROG = ["46026", "46013", "46042", "46011", "46054", "41009", "41010", "42036", "42040", "44025", "44013", "44009"]


def waves(b, year=2015):
    url = f"https://www.ndbc.noaa.gov/data/historical/stdmet/{b}h{year}.txt.gz"
    try:
        raw = gzip.decompress(urllib.request.urlopen(url, timeout=60).read()).decode()
    except Exception as e:  # a buoy with no 2015 file is skipped
        print(b, "skipped:", e)
        return {}
    out = {}
    for ln in raw.splitlines()[2:]:
        p = ln.split()
        h, dpd, apd = float(p[8]), float(p[9]), float(p[10])
        if h >= 99 or dpd >= 99 or apd >= 99:
            continue
        t = dt.datetime(int(p[0]), int(p[1]), int(p[2]), int(p[3]), int(p[4]))
        out.setdefault(t.replace(minute=0) + dt.timedelta(hours=1 if t.minute >= 30 else 0), (h, dpd, apd))
    print(b, len(out), "wave hours")
    return out


def main():
    raw = urllib.request.urlopen(TEL, timeout=300).read().decode()
    rows = list(csv.reader(io.StringIO(raw)))[2:]
    hours = {}
    for t, la, lo, ws in rows:
        try:
            v = float(ws) * KN
            la, lo = float(la), float(lo)
        except ValueError:
            continue
        if v != v:
            continue
        k = dt.datetime.strptime(t[:13], "%Y-%m-%dT%H")
        hours.setdefault(k, []).append((la, lo, v))
    W = {b: waves(b) for b in BUOYS}
    out = []
    for k in sorted(hours):
        s = hours[k]
        if len(s) < 6:
            continue
        la = statistics.fmean(x[0] for x in s)
        lo = statistics.fmean(x[1] for x in s)
        best = None
        for b, pos in BUOYS.items():
            for dh in (0, -1, 1):
                w = W[b].get(k + dt.timedelta(hours=dh))
                if w:
                    d = km((la, lo), pos)
                    if best is None or d < best[1]:
                        best = (b, d, w)
                    break
        if best is None:
            continue
        b, d, (h, dpd, apd) = best
        out.append([k.strftime("%Y-%m-%dT%H"), round(la, 4), round(lo, 4), round(statistics.fmean(x[2] for x in s), 4),
                    len(s), b, round(d, 1), h, dpd, apd])
    with open("experiments/data/waveglider_hourly.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["hour", "lat", "lon", "speed", "n", "buoy", "dist_km", "wvht", "dpd", "apd"])
        w.writerows(out)
    print(len(out), "hours written")
    rows = []
    for b in PROG:
        for t, (h, dpd, apd) in sorted(waves(b, 2024).items()):
            if t.year == 2024 and t.month in (1, 7):
                rows.append([b, t.month, t.strftime("%Y-%m-%dT%H"), h, dpd, apd])
    with open("experiments/data/ndbc_waves_2024.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["buoy", "month", "hour", "wvht", "dpd", "apd"])
        w.writerows(rows)
    print(len(rows), "programme buoy-hours written")


if __name__ == "__main__":
    main()
