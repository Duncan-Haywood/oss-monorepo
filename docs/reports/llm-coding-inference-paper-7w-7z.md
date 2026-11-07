# llm-coding-inference: paper catch-up (2026-11-07)

`paper/paper.md` Section 6 now has the 7w to 7z paragraph (neg_guard default, drop-the-screen check), verified line by line against `experiments/h7w_gratitude.txt`, `h7x_*.txt`, `h7y_*.txt`. Milestones 7a to 7v are still not in the paper. The next run should either fold those in (7o to 7v: the k = 3 guard's origin) or run the open check: a second LLM coder or corpus for dropping the tau screen. No model weights are cached in the cloud image, so a second LLM needs a download probe first.
