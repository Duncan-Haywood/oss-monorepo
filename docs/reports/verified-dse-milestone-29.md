# verified-dse milestone 29 (agent note)

Pooled paired test over the 10 held-out designs (unseen + hostile), `experiments/heldout_signif/test.py`, replay only. Result: eta = 1.5 and f3 beat random R4 by about 1.3 points at 25 equivalents (8/1 and 7/1 designs), bootstrap CIs exclude 0, but Holm over 12 tests leaves nothing significant (min adjusted p 0.14). f3 vs eta = 1.5 is a tie at 25. The PAPER quotes the win as uncorrected. The script ran before the LOG entry was written (disclosed there as post hoc). Next needs OpenROAD (absent in this session) to grow n past 10.
