"""Replace the assumed SSD and reader masses with the range found in listings. Writes ssdmass.txt.

    PYTHONPATH=src python experiments/ssdmass.py

Each scenario sets the mass of every SSD size (1, 2 and 4 TB) and of one reader, then reruns the exact search over
all kits at 4 h/day, 7 days, two SSD copies, 1 h offload. Reported: the lightest total for all 18 shots, and the
most shots within 4,000 g.
"""
from pathlib import Path
from capture_kitstore import all_kits, storage, total_grams, variety, hours, legal
from capture_kitstore import model

HERE = Path(__file__).resolve().parent
BUDGET = 4000
# name: (SSD g for 1/2/4 TB, reader g). Listing figures, read 2026-10-22, see README table.
SCEN = {
    "as assumed before (45/55/75, 25)": ({1000: 45.0, 2000: 55.0, 4000: 75.0}, 25.0),
    "light: Crucial X9 32 g all sizes, reader 28": ({1000: 32.0, 2000: 32.0, 4000: 32.0}, 28.0),
    "Samsung T7 58 g all sizes, reader 28": ({1000: 58.0, 2000: 58.0, 4000: 58.0}, 28.0),
    "heavy: 58 g SSDs, reader 85": ({1000: 58.0, 2000: 58.0, 4000: 58.0}, 85.0),
}


def run(kits, ssd, reader):
    model.SSD_G, model.READER_G = ssd, reader
    full, best, bestk = None, 0, None
    for k in kits:
        if not legal(k) or hours(k) < 4.0:
            continue
        st = storage(k, 4.0, days=7)
        if st is None:
            continue
        g, v = total_grams(k, st), variety(k)
        if g <= BUDGET and v > best:
            best = v
        if v == 18 and (full is None or g < full[0]):
            full = (g, st.grams, st.readers, st.ssds)
    return full, best


def main():
    kits = list(all_kits())
    out = [f"kits: {len(kits)}; 4 h/day, 7 d, 2 SSD copies, offload within 1 h, UHS-I ceiling"]
    out.append("scenario | lightest 18-shot total g | its storage g | readers | SSDs | most shots within 4000 g")
    for name, (ssd, reader) in SCEN.items():
        full, best = run(kits, ssd, reader)
        f = f"{full[0]:.0f} | {full[1]:.0f} | {full[2]} | {full[3]}" if full else "- | - | - | -"
        out.append(f"{name} | {f} | {best}")
    (HERE / "ssdmass.txt").write_text("\n".join(out) + "\n")
    print("\n".join(out))


if __name__ == "__main__":
    main()
