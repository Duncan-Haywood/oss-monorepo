"""Download only the five smartphone channels (and speaker.csv) of LibriWASN subsets from Zenodo
(CC BY 4.0, doi:10.5281/zenodo.10952434), by HTTP range requests into the 4.4-4.8 GB zips: about 1 GB
for 200_0S plus 800_0S, a few minutes with 8 threads. The range reading is research/_shared/remote_zip.py.

    python experiments/real-devices/fetch.py <out dir> 200_0S 800_0S
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "_shared"))
from remote_zip import fetch, members  # noqa: E402

RECORD = "https://zenodo.org/api/records/10952434/files/LibriWASN_{}.zip/content"
PHONES = r"/(Xiaomi|Pixel7|Pixel6a|Pixel6b|Nexus)_[^/]*\.wav$|speaker\.csv$"


def main():
    out = sys.argv[1]
    jobs = [(RECORD.format(sub), i) for sub in sys.argv[2:] for i in members(RECORD.format(sub), PHONES)]
    with ThreadPoolExecutor(8) as ex:
        for f in [ex.submit(fetch, u, i, out, lambda s: print(s, flush=True)) for u, i in jobs]:
            f.result()
    print("DONE")


if __name__ == "__main__":
    main()
