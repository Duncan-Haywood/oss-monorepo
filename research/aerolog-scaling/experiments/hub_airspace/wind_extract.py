"""Fetch ERA5 hourly 100 m wind at milestone 11a's hub, April to September 2014, from the Open-Meteo historical
weather API (https://open-meteo.com/en/docs/historical-weather-api; data CC BY 4.0; ERA5: Hersbach et al., 2020,
doi:10.1002/qj.3803). Writes era5_wind_nyc_2014.json (speeds in m/s, directions in degrees the wind blows FROM)."""
import json
import os
import urllib.request

URL = ("https://archive-api.open-meteo.com/v1/archive?latitude=40.75&longitude=-73.9875"
       "&start_date=2014-04-01&end_date=2014-09-30&hourly=wind_speed_100m,wind_direction_100m"
       "&wind_speed_unit=ms&timezone=UTC&models=era5")


def main():
    with urllib.request.urlopen(URL, timeout=60) as r:
        d = json.load(r)
    h = d["hourly"]
    out = {"source": "Open-Meteo historical weather API, ERA5 (CC BY 4.0)", "url": URL,
           "latitude": d.get("latitude"), "longitude": d.get("longitude"),
           "time": h["time"], "wind_speed_100m": h["wind_speed_100m"], "wind_direction_100m": h["wind_direction_100m"]}
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "era5_wind_nyc_2014.json")
    json.dump(out, open(path, "w"), separators=(",", ":"))
    print(f"{len(h['time'])} hours -> {path}")


if __name__ == "__main__":
    main()
