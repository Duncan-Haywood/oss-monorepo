# lowcomm-training milestone 5i (agent note)

- M = 16 median arms landed first via #10960 (identical numbers); this PR adds the trimmed-mean arm: `research/lowcomm-training/experiments/gpt_median_m16/`. Median flip cost +0.0036 (se 0.0039, 3 seeds) vs 0.0207 at M = 8; trimmed 2.5x that but se 0.0070. Neither resolved at 3 seeds.
- Next run: add seeds 3 to 12 for the two attacked arms plus the unattacked median (`SEEDS` in `median_m16.py`; the script skips finished jobs). Each run is ~39 min with 4 in parallel on 4 cores.
- Torch: `python3 -m pip install torch numpy` took ~55 min this session (0.7 MB/s on the first CUDA wheels); start it in the background first. `wait_for.py` needs a DONE line pip never prints.
