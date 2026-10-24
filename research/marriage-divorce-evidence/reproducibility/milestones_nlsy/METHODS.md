# First biological birth and later annual legal divorce

This supplementary analysis uses the already validated prospective NLSY79 baseline-marriage intervals in ../couple_profiles/couple_profile_input.csv, restricting to current FIRST marriages. It adds only wave-specific birth histories known at each baseline2000,2002,...2020. It does not change any report or hosting files.

## Reproduction and source

Run `python3 extract.py`, then `python3 analyze.py`. Extraction reads original public archive ../longitudinal/nlsy79_all_1979-2022.zip from https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip . Its source/checksum are in ../longitudinal/source_manifest.json. Exact variables and codebook text are preserved in selected_codebook.json. The compact birth_baselines.csv contains first-birth month/year and age-at-first-birth code from each baseline wave plus respondentID. It does not use XRND/latest first-birth data.

Variables C1DOB00~M/Y through C1DOB20~M/Y are first biological child's birth month/year as of each interview; AGE1B00 through AGE1B20 explicitly code -998='NO1STBIRTHHASOCCURRED'. A missing, refused, don't-know, invalidskip or noninterview code is never recoded childless. Childless-at-baseline classification requires the explicit -998flag plus negative birth month/year; inconsistent flag/date pairs are excluded. Dates require validmonth1–12 and reasonable calendaryear1900–2023. Month midpoint convention matches the existing annual interval pipeline.

## Definition and target population

The landmark is the RESPONDENT's first biological birth that occurred between current first-marriage start and baseline interview. It is not necessarily the first common biological child of both spouses, first adopted/stepchild, youngest child, or date a child left home. First births preceding the current first marriage are excluded from landmark-band rates and reported in coverage separately. Only baseline first marriages are included, so later-marriage selection is not mixed into this particular comparison.

Baseline bands:0–4years (<5),5–12years (<13),13–17years (<18),18–24years (<25),25+years since that birth; verified nofirstbirth bybaseline is separate. Follow-up outcome is the SAME baseline marriage's first legal divorce before widowhood or next interview. It does not follow a replacement marriage. Person-time/event construction is inherited from ../annual_nlsy and ../pairing_nlsy documentation. A child born during follow-up does not retroactively move that interval from baseline-childless to a parent group.

The source input is the complete-couple positive-combined-wage profile-model sample, not all original cohort marriages or newlyweds. It requires observed baseline spouse/covariates and valid adjacent interview outcome/exposure. There is NO requirement of survival or interview retention through2022: each valid observed adjacent-wave interval contributes. Respondents born1957–1964 are approximately36–63 across baseline waves2000–2020, so recent first births are intrinsically uncommon. First marriages have already survived to these baseline ages. These restrictions limit generalizability, especially to people having children in their20s today.

## Estimates and uncertainty

For each baseline band, legal-divorce events divided by person-years, using that interval's baseline survey weight, reported per1000person-years. A person may contribute to multiple waves and, over time, several landmark bands. Ratio-estimator influence is w_i(event_i−rate×exposure_i)/weighted person-years; sum within respondent before sandwich variance. G/(G−1) finite-cluster correction; log95%CI for positive event rates; zero events have undefined intervals. These are APPROXIMATE respondent-cluster/weight-adjusted intervals, not full original surveyPSU/strata design intervals. Fewer10observed divorce events are flagged. Counts include intervals, distinct respondents, events and person-years. Distinct respondent counts across groups must not be summed because people can age into different bands.

No test selects a breakpoint or searches for a minimum; no multiplicity correction is applied. Baseline-band rates are descriptive and unadjusted for age, marriage duration, schooling, wages, cohort or selection. Mean current age and marriage duration are reported to make these differences visible. Time since first birth, age and marriage duration are mechanically linked; this table does not estimate what would happen if a couple had a child or postponed divorce until a child's birthday. No causal childbearing recommendation, empty-nest claim, threshold guarantee or personalized forecast follows.

## Observed support and findings

Current first-marriage input:24,067intervals,324observed divorces. Coverage:17,748intervals/2,478distinct respondents/220divorces with firstbiological birth within the current first marriage;2,836intervals/517respondents/45divorces with explicit no-first-birth flag;3,473intervals/658respondents/59divorces whose firstbirth preceded marriage (excluded from landmark bands);10intervals missing/invalid birth history.

Pooled annual legal divorces per1000person-years: nofirstbirth8.59(approx95%CI6.22–11.87);0–4years8.98(4.23–19.08;only8events);5–12years8.78(6.51–11.84);13–17years7.50(5.53–10.16);18–24years5.81(4.42–7.65);25+years3.25(2.30–4.59). Rates decline across older parental-duration bands, but the groups differ strongly in current age and marriage duration:5–12year parents average age42.1/married14.1years;25+year parents average age55.0/married33.1years. This is not evidence of a biological-child birthday at which risk suddenly drops. Recent firstbirth support is too small for a stable contemporary early-parenthood conclusion, and no exact threshold or optimal parenthood recommendation is estimated.

`validate.py` confirms unique person/wave keys, first-marriage restriction, positive exposure, nofuturebirthclassification, withinmarriage birth dates, explicit childlessflag, partition totals and independent weighted-rate point estimates. No report application files were modified.
