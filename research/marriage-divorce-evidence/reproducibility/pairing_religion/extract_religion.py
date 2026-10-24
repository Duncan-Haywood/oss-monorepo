from pathlib import Path
import zipfile,csv,io,json,re
ROOT=Path(__file__).resolve().parent
cols=['R0000100','R6533500','R6533600','R6538600','R6538700']
with zipfile.ZipFile(ROOT.parent/'longitudinal/nlsy79_all_1979-2022.zip') as z,z.open('nlsy79_all_1979-2022.csv') as b,open(ROOT/'baseline_religion.csv','w') as out:
 r=csv.reader(io.TextIOWrapper(b));h=next(r);idx=[h.index(c) for c in cols];w=csv.writer(out);w.writerow(cols)
 for row in r:w.writerow([row[i] for i in idx])
with zipfile.ZipFile(ROOT.parent/'longitudinal/nlsy79_all_1979-2022.zip') as z:text=z.read('nlsy79_all_1979-2022.cdb').decode()
ms=list(re.finditer(r'^([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)',text,re.M));D={}
for i,m in enumerate(ms):
 k=m[1].replace('.','')
 if k in cols:D[k]={'ref':m[1],'name':m[2],'year':m[3],'block':text[m.start():ms[i+1].start() if i+1<len(ms) else len(text)]}
json.dump(D,open(ROOT/'selected_codebook.json','w'),indent=2)
