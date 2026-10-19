# Degree and profession: available evidence and an original ACS check

This folder provides a bounded original ACS2023 degree×broadoccupation table and audits the limits of prospective detailed-credential×profession analysis. No report/site files or machine-learning inputs are changed.

## Which credentials and professions can be identified?

ACS SCHL21bachelor,22master,23professional degree,24doctorate distinguish the highest attained broad credential. A professional degree is a CREDENTIALcategory, not an occupation and not a separateMD/JDlabel. Doctorate does not establish the discipline. FOD1P/FOD2P contain bachelor-field information, not the field/type of a subsequent master's, professional degree or doctorate. Current occupation can distinguish some occupational codes such as physicians or lawyers/judges, but does not verify that a person obtained a particular credential or earned it before a divorce.

The existing compactACS dataset lacks OCCP. These scripts stream original nationalZIP directly rather than incorrectly matching only an occupation aggregate onto respondents. Official source https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/csv_pus.zip and dictionary https://www2.census.gov/programs-surveys/acs/tech_docs/pums/data_dict/PUMS_Data_Dictionary_2023.pdf ; both preserved/checksummed in ../acs. Mapping is parsed from official OCCP descriptions, bounded to theOCCPsection, saved as occupation_prefix_mapping.json. Prefix-based prespecified broadgroups: MGR/BUS/FINmanagement/business/finance; CMM/ENG/SCIcomputing/engineering/science; LGLlegal; EDUeducation/library; MEDhealthcarepractitioners/technical; CMScommunity/socialservices; ENTarts/media; allremaining validcodes otheroccupations. These research aggregations use officialcodeprefixes but are not a claim to reproduce every Censuspublishedmajoroccupationgroup. Healthcare support(HLS) is inotheroccupations rather than practitioner/technical. No minimum-outcome group is selected.

## Population and outcome

Both versions: ages30–64, degreeSCHL21–24, approximate current/recentmarriageexposure defined currentlymarried/separated(MAR1/4) OR reporteddivorcepast12months(MARHD1). Numerator past12monthsreportedlegaldivorce. Percentage = weighteddivorceeventrespondents/weighteddenominatorrespondents; not person-yearhazard or fixedmarriageprospectiverisk.

Primary full-exposure version (`analyze_acs_all.py`) retains the full eligible population. OCCP can reflect a current occupation OR last occupation withinfiveyears for nonworkers. Missingoccupation is explicitly separate; anyunexpected unmappedcode is separate for validation. This occupational measure may follow the divorce and is NOT a prospective predictor.

Additional currently-employed civilian version (`analyze_acs.py`, outputs currently_employed_*) restricts ESR1/2 to ensure currentemployment and a currentjoboccupation. This introduces further employment selection and is not the whole marriage-exposed population. It is a sensitivity/definitioncheck, not interchangeable with the primary full-exposure table.

No interviewage adjustment is applied: all percentages are CRUDE contemporaneous degree×sex×occupation associations. Withinage30–64groups can differ substantially in actual age, marriage duration/order, income, immigration, workhours, or other circumstances. Male/female rows are separate respondent groups, not necessarily spouses. Neither table ranks ideal professions or forecasts a new marriage.

## Weights, confidence intervals and support

PWGTPand80personreplicateweights. Successive-difference-replication variance =4/80sum((replicatepercentage−fullpercentage)^2); normal95%CI bounded0–100%. Groupweighteddenominator/numerator and unweightedrespondent/eventcounts are retained. Prespecified descriptive-support flag requires n≥100 AND≥20events. A flag is a caution threshold, not everyCensuspublicationcriterion; no precise ranking is made even for unflagged groups. Allocation/nonresponse and measurementerror are not removed by sampling intervals; no multiplecomparisoncorrection. Replicateaggregate totals preserve original calculations.

## Prospective NLSY79 feasibility

Original NLSY79archive contains baseline occupations (e.g.2000CPSOCC80.01 for respondent'scurrent/mostrecentjob and OCCALL-SPOUSE for spouse'smainjob), but NONEof the auditedcandidatefields is in the existing annual model extract. Exactcodebooks are saved in candidate_nlsy_occupation_codebooks.json. A credible prospective professionanalysis requires explicit main/currentjob selection, occupation-codecrosswalks acrosswaves, predissolution credentialmeasurement and coverage/eventcounts for eachpair. It cannot be obtained by merging currentACS occupation onto NLSY respondents or treating schoolingyears as exactdegree types. CrossedMD/JD/doctoratediscipline-byprofession prediction is not established by present inputs. This cycle does not undertake that jobharmonization.

## Reproduce

Run `python3 analyze_acs.py` for current-employment sensitivity and `python3 analyze_acs_all.py` for full-exposure primary table. Both read shared original ../acs/csv_pus.zip and dictionary and write separate results. Preserved candidatecodebooks and nlsy_feasibility.json document the occupation audit. Scripts operate only in this folder.

## Coverage and validation

Full-exposure table contains425,403respondents and4,556past-year divorce reports across80sex×degree×occupationcells;41cells meet n≥100/events≥20descriptive-support rule. Missingoccupation and code9920(no workexperience in lastfiveyears/earlier/neverworked) remain separate categories. Code9920is the sole official occupation recode without an occupationprefix and is explicitly handled; unexpected unmappedcodes are audited, not assigned to a profession. `validate.py` independently compares all81weighted denominator/event totals and samplecounts against the earlier separately extracted ACS compactdataset using identical degree/age/maritalfilters. It also checks no unmappedoccupation remains and all predefinedcells are retained. These validate calculations, not temporal ordering or causal interpretation.
