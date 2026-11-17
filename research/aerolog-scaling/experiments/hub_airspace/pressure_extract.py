"""Milestone 11ak data step: download NOAA ISD 2014 files for the five NYC stations from the public AWS bucket
(https://noaa-isd-pds.s3.amazonaws.com/data/2014/<usaf>-<wban>-2014.gz) and write the METAR/SPECI altimeter
settings and station pressures (quality codes 1 and 5) to nyc_isd_pressure_2014.json.

    python3 pressure_extract.py [download_dir]
"""
import json
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pressure_ref as pr  # noqa: E402

URL = "https://noaa-isd-pds.s3.amazonaws.com/data/2014/%s-2014.gz"


def main(ddir):
    os.makedirs(ddir, exist_ok=True)
    out = {"source": "NOAA Integrated Surface Database (ISD), noaa-isd-pds AWS bucket, 2014; FM-15/FM-16 MA1 group",
           "units": "t: minutes from 2014-01-01 00:00 UTC; alt (altimeter setting) and stn (station pressure): hPa",
           "stations": {}}
    for name, sid in pr.STATIONS.items():
        path = os.path.join(ddir, "%s-2014.gz" % sid)
        if not os.path.exists(path):
            urllib.request.urlretrieve(URL % sid, path)
        rows, ll = pr.load_station(path)
        out["stations"][name] = {"isd": sid, "lat": ll[0], "lon": ll[1],
                                 "t": [round(r[0]) for r in rows], "alt": [r[1] for r in rows],
                                 "stn": [r[2] for r in rows]}
        print(name, sid, len(rows), "reports", file=sys.stderr)
    json.dump(out, open(os.path.join(HERE, "nyc_isd_pressure_2014.json"), "w"), separators=(",", ":"))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "_isd"))
