# Stopping rule for milestone 144 (written during the flow, before the extension)

The first launch (two-hour background cap, set to 105 min) ran about 20 points a minute, slower than milestone 143's 28,
because the 256-bit left clamps take far longer at ff. At 66 minutes, with 14 designs complete, the analysis was run once on that
prefix (an interim look, not planned in the commit that fixed the predictions). Its result: SWC better on 8, worse on 6.

Decided at that point, before any further result: when the first launch stops, resume with `run.py --resume` for one more launch
of at most 75 minutes, and analyse the longest complete prefix of ORDER when it stops, capped at the first 27 designs (milestone
143's ss set, so the two corners compare on the same designs). The interim 14-design numbers are reported alongside, so the
look is visible. The predictions in analyse.py are unchanged.
