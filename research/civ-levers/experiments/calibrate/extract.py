"""Download the GSS 2016-2020 panel and write per-item x0-by-x1 cross-tables.

    python3 extract.py [path/to/gss2020panel_r1.dta]

With no path it downloads GSS_2020_panel_stata.zip from NORC (about 12 MB). Needs pandas.
Writes crosstabs.json: for each item and wave pair, the counts of respondents by
(wave-1 answer, wave-2 answer), answers rescaled in the order of the codebook values.
No respondent-level rows are written.
"""
import io, json, sys, urllib.request, zipfile
import pandas as pd

URL = "https://gss.norc.org/content/dam/gss/get-the-data/documents/stata/GSS_2020_panel_stata.zip"
# attitude items (not demographics, behaviours or paradata)
ITEMS = ["polviews", "partyid", "eqwlth", "helppoor", "helpsick", "helpblk", "helpnot", "helpoth",
         "homosex", "premarsx", "xmarsex", "teensex", "pillok", "spanking", "fepresch", "fefam",
         "fechld", "meovrwrk", "affrmact", "marblk", "marwht", "marasian", "marhisp", "liveblks",
         "letin1a", "obey", "thnkself", "workhard", "kidssol",
         "parsol", "intlblks", "intlwhts", "workblks", "workwhts", "helpblk", "bible"]


def load(path=None):
    if path:
        return pd.read_stata(path, convert_categoricals=False)
    raw = urllib.request.urlopen(URL, timeout=300).read()
    z = zipfile.ZipFile(io.BytesIO(raw))
    name = [n for n in z.namelist() if n.endswith(".dta")][0]
    return pd.read_stata(io.BytesIO(z.read(name)), convert_categoricals=False)


def main():
    d = load(sys.argv[1] if len(sys.argv) > 1 else None)
    out = {}
    for b in dict.fromkeys(ITEMS):
        for tag, (p, q, years) in {"2016-2020": ("_1a", "_2", 4), "2018-2020": ("_1b", "_2", 2)}.items():
            if b + p not in d or b + q not in d:
                continue
            X = d[[b + p, b + q]].apply(pd.to_numeric, errors="coerce").dropna()
            if len(X) < 300:
                continue
            levels = sorted(set(X.iloc[:, 0]) | set(X.iloc[:, 1]))
            if not 4 <= len(levels) <= 11:
                continue
            ct = pd.crosstab(X.iloc[:, 0], X.iloc[:, 1]).reindex(index=levels, columns=levels, fill_value=0)
            out[f"{b}|{tag}"] = {"item": b, "pair": tag, "years": years, "levels": [float(v) for v in levels],
                                 "n": int(len(X)), "table": ct.values.tolist()}
    json.dump(out, open("crosstabs.json", "w"), indent=0)
    print(len(out), "tables,", sum(v["n"] for v in out.values()), "respondent pairs")


if __name__ == "__main__":
    main()
