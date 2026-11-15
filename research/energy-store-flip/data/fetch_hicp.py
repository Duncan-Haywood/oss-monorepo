"""Regenerate data/hicp_annual.csv: Eurostat HICP, all items (CP00), annual average index 2015 = 100 (prc_hicp_aind, INX_A_AVG).

    python data/fetch_hicp.py > data/hicp_annual.csv

Source: Eurostat, dataset prc_hicp_aind, https://ec.europa.eu/eurostat/databrowser/view/prc_hicp_aind/default/table
(reuse under the Eurostat copyright notice, CC BY 4.0). Stdlib only.
"""
import json
import urllib.request

URL = ("https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hicp_aind"
       "?format=JSON&geo=DE&geo=EA20&coicop=CP00&unit=INX_A_AVG&lang=EN")


def main():
    d = json.load(urllib.request.urlopen(URL, timeout=60))
    t = d["dimension"]["time"]["category"]["index"]
    g = d["dimension"]["geo"]["category"]["index"]
    v = d["value"]
    print("geo,year,hicp_2015_100,source_updated")
    for geo, gi in sorted(g.items()):
        for year, ti in sorted(t.items()):
            x = v.get(str(gi * len(t) + ti))
            if x is not None and year >= "2014":
                print("%s,%s,%s,%s" % (geo, year, x, d.get("updated", "")))


if __name__ == "__main__":
    main()
