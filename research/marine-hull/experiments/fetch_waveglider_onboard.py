"""Milestone 6u data: the Honey Badger Wave Glider's own wave, wind and power records, hour by hour.

6p to 6t matched each hour of through-water speed to the nearest NDBC buoy (median 144 km, up to 300 km, and up to
~1,000 km in the post-hoc runs). The same NOAA SWFSC ERD ERDDAP server (coastwatch.pfeg.noaa.gov; licence: "may be used
and redistributed for free") also serves the vehicle's on-board records for the MAGI mission (UT Austin, T. Villareal,
20 May to 4 Nov 2015), which no earlier milestone used:
  LiquidR_HBG3_2015_mose_v2   Datawell MOSE wave sensor on the float ("version 2, from Cara Wilson"): wave_height (m),
                              average_wave_period, dominant_wave_period (s), wave_direction (deg true, "to").
  LiquidR_HBG3_2015_weather   on-board weather station: avg_wind_speed (knots), avg_wind_direction (from, deg true).
  LiquidR_HBG3_2015_telemetry water_speed (knots), desired_heading, sub_heading (deg), total_power, target_waypoint.
Output: experiments/data/waveglider_onboard_hourly.csv, one row per UTC hour that has at least 6 telemetry samples:
hour, n, speed (mean through-water m/s), power (median total_power, the dataset's unit, unlabelled), heading (circular
mean of sub_heading), desired (circular mean of desired_heading), waypoint (mode), and, where the hour has them,
hs, tavg, tdom, wdir (mean of MOSE records in the hour) and wind (m/s), wind_from (deg) from the weather station.
Run: python3 experiments/fetch_waveglider_onboard.py   (about 5 MB, under a minute)"""
import csv
import io
import math
import statistics as st
import time
import urllib.error
import urllib.request
from collections import Counter

E = "https://coastwatch.pfeg.noaa.gov/erddap/tabledap/"
KN = 0.514444
URLS = {
    "tel": E + "LiquidR_HBG3_2015_telemetry.csv?time,water_speed,total_power,desired_heading,sub_heading,target_waypoint",
    "mose": E + "LiquidR_HBG3_2015_mose_v2.csv?time,wave_height,average_wave_period,dominant_wave_period,wave_direction",
    "wx": E + "LiquidR_HBG3_2015_weather.csv?time,avg_wind_speed,avg_wind_direction",
}


def get(name):
    for attempt in range(5):  # ERDDAP answers 503 now and then
        try:
            raw = urllib.request.urlopen(URLS[name], timeout=300).read().decode()
            break
        except urllib.error.HTTPError as e:
            if attempt == 4:
                raise
            print(name, "HTTP", e.code, "- retrying")
            time.sleep(3 * 2 ** attempt)
    return list(csv.reader(io.StringIO(raw)))[2:]


def num(s):
    try:
        v = float(s)
    except ValueError:
        return None
    return None if v != v else v


def cmean(degs):
    s = sum(math.sin(math.radians(d)) for d in degs)
    c = sum(math.cos(math.radians(d)) for d in degs)
    return round(math.degrees(math.atan2(s, c)) % 360, 1)


def bucket(rows, ncol):
    out = {}
    for r in rows:
        vals = [num(x) for x in r[1:1 + ncol]]
        out.setdefault(r[0][:13], []).append(vals)
    return out


def main():
    tel, mose, wx = bucket(get("tel"), 5), bucket(get("mose"), 4), bucket(get("wx"), 2)
    print(sum(map(len, tel.values())), "telemetry,", sum(map(len, mose.values())), "MOSE,",
          sum(map(len, wx.values())), "weather records")
    out = []
    for k in sorted(tel):
        if not k.startswith("2015-"):  # the feed carries one blank-time and one 1999 row
            continue
        s = [v for v in tel[k] if v[0] is not None]
        if len(s) < 6:
            continue
        pw = [v[1] for v in s if v[1] is not None]
        hd = [v[3] for v in s if v[3] is not None]
        de = [v[2] for v in s if v[2] is not None]
        wp = [v[4] for v in s if v[4] is not None]
        row = [k, len(s), round(st.fmean(v[0] for v in s) * KN, 4), st.median(pw) if pw else "",
               cmean(hd) if hd else "", cmean(de) if de else "", int(Counter(wp).most_common(1)[0][0]) if wp else ""]
        m = [v for v in mose.get(k, []) if v[0] is not None and 0 < v[0] < 20]
        if m:
            row += [round(st.fmean(v[0] for v in m), 3),
                    round(st.fmean(v[1] for v in m if v[1] is not None), 2) if any(v[1] is not None for v in m) else "",
                    round(st.fmean(v[2] for v in m if v[2] is not None), 2) if any(v[2] is not None for v in m) else "",
                    cmean([v[3] for v in m if v[3] is not None]) if any(v[3] is not None for v in m) else ""]
        else:
            row += ["", "", "", ""]
        w = [v for v in wx.get(k, []) if v[0] is not None and v[1] is not None and 0 <= v[0] < 100]
        row += [round(st.fmean(v[0] for v in w) * KN, 3), cmean([v[1] for v in w])] if w else ["", ""]
        out.append(row)
    with open("experiments/data/waveglider_onboard_hourly.csv", "w", newline="") as f:
        c = csv.writer(f)
        c.writerow(["hour", "n", "speed", "power", "heading", "desired", "waypoint", "hs", "tavg", "tdom", "wdir",
                    "wind", "wind_from"])
        c.writerows(out)
    print(len(out), "hours written;", sum(1 for r in out if r[7] != ""), "with MOSE waves;",
          sum(1 for r in out if r[11] != ""), "with wind")


if __name__ == "__main__":
    main()
