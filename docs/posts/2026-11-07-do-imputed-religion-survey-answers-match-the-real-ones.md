# Do imputed religion-survey answers match the real ones?

If you fill in a Catholic GSS respondent's unasked answer from the other answers they gave, is the resulting share right for each decade and each immigrant generation? I checked this on the GSS 1972-2024 for 13 Catholic items (`research/christian-belief-models`, milestone 2).

Every prediction is out-of-fold: the model never saw that respondent. Across 180 decade-by-generation cells the typical miss was 1.2 points, and 94% of the 95% intervals contained zero (about 95% would by chance). The worst single cells missed by 6 to 8 points: second-generation Catholics in the 1970s on making divorce harder, and first-generation Catholics in the 1980s on sex before marriage. Calibration error was under 0.03 on 12 of 13 items. Cohabitation (0.041), asked of only 1,489 Catholics, was the exception.

Limits: one fold seed, bootstrap intervals that ignore the survey's clustering, and no comparison yet against a ballot held out whole. Code, tables and the log are in `research/christian-belief-models/experiments/m2_calibration/`. The data is public GSS microdata; nothing here profiles an individual.
