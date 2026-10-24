"""Package aggregate results and reproducible analysis code for the hosted report.

Individual-record extracts, interval files and original microdata are excluded.
"""
from pathlib import Path
import base64,json,zipfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'outputs'
SOURCE=OUT/'reproducibility'
excluded={'annual_nlsy_extract.csv','nlsy_annual_intervals.csv','annual_risk_input.csv','pairing_nlsy_extract.csv','spouse_pair_intervals.csv','baseline_religion.csv','religion_analysis_extract.csv','nlsy79_extract.csv','baseline_politics.csv','politics_analysis_extract.csv'}
files=[]
for p in sorted(SOURCE.rglob('*')):
    if not p.is_file() or '__pycache__' in p.parts: continue
    if p.suffix in {'.py','.sh','.md','.ipynb'}: files.append(p)
    elif p.suffix=='.csv' and p.name not in excluded: files.append(p)
    elif p.name in {'source_manifest.json','manifest.json','checks.json','validation.json','independent_checks.json'}: files.append(p)
archive=OUT/'Marriage_Divorce_Tables_and_Code.zip'
with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    z.writestr('START_HERE.md','# Marriage and divorce: aggregate tables and analysis code\n\nResearch snapshot prepared 19 October 2026 from ACS 2023, NSFG 2017–2019, and NLSY79 through 2022. See each analysis METHODS.md or README.md for denominators, weights, uncertainty and limitations.\n\nThis download excludes individual-record microdata. Download original data using the included source URLs and extraction scripts. The full local research bundle includes compact analytical datasets. Annual percentages, person-year event rates and historical prevalence answer different questions. Do not pool them or treat associations as causal effects.\n')
    for p in files: z.write(p, 'reproducibility/'+str(p.relative_to(SOURCE)))
    z.writestr('CONTENTS.json',json.dumps([str(p.relative_to(SOURCE)) for p in files],indent=2))
encoded=base64.b64encode(archive.read_bytes()).decode()
(OUT/'report-app/src/content/research-download.js').write_text('export const researchDownload = '+json.dumps('data:application/zip;base64,'+encoded)+';\n')
print(json.dumps({'files':len(files),'bytes':archive.stat().st_size,'individual_microdata_included':False}))
