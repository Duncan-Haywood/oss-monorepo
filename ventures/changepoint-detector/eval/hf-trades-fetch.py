"""Fetch the trade samples of the R package highfrequency (GPL >= 2; Boudt, Kleen and Sjoerup 2022,
doi:10.18637/jss.v104.i08) and write them as DT,PRICE CSVs for eval/stale-real-trades.mjs.

The data is not committed (GPL); this script fetches it. Needs pyreadr (pip install pyreadr pandas).
usage: python3 eval/hf-trades-fetch.py <dir>
"""
import sys, os, urllib.request
import pyreadr

BASE = 'https://raw.githubusercontent.com/jonathancornelissen/highfrequency/master/data/'
NAMES = ['sampleTDataEurope', 'sampleTData']

def main(out):
    os.makedirs(out, exist_ok=True)
    for name in NAMES:
        rda = os.path.join(out, name + '.rda')
        if not os.path.exists(rda):
            urllib.request.urlretrieve(BASE + name + '.rda', rda)
        d = pyreadr.read_r(rda)[name]
        d[['DT', 'PRICE']].to_csv(os.path.join(out, name + '.csv'), index=False)
        print(name, len(d), 'trades')

if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'hf-data')
