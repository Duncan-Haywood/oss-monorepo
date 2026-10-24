from pathlib import Path
import json,csv,io,zipfile,re
P=Path(__file__).resolve().parent;D=json.loads((P.parent/'longitudinal/codebook_index.json').read_text());keep={'R0000100':D['R0000100']}
for k,v in D.items():
 if v['year'].isdigit() and 2000<=int(v['year'])<=2020 and (re.fullmatch(r'C1DOB\d\d~[MY]',v['name']) or re.fullmatch(r'AGE1B\d\d',v['name'])):keep[k]=v
(P/'selected_codebook.json').write_text(json.dumps(keep,indent=2))
with zipfile.ZipFile(P.parent/'longitudinal/nlsy79_all_1979-2022.zip') as z,z.open('nlsy79_all_1979-2022.csv') as f,open(P/'birth_baselines.csv','w') as out:
 r=csv.reader(io.TextIOWrapper(f));h=next(r);ix=[i for i,c in enumerate(h) if c in keep];w=csv.writer(out);w.writerow([h[i] for i in ix])
 for row in r:w.writerow([row[i] for i in ix])
print('Extracted',len(ix),'baseline birth-history fields')
