"""Extract predissolution spouse roster, earnings and marriage dates from official cached NLSY79 archive."""
import pathlib,json,re,zipfile,csv,io,urllib.request
P=pathlib.Path(__file__).resolve().parent;Z=P.parent/'longitudinal/nlsy79_all_1979-2022.zip'
if not Z.exists():
 Z=P/'nlsy79_all_1979-2022.zip'
 if not Z.exists():urllib.request.urlretrieve('https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip',Z)
with zipfile.ZipFile(Z) as z:
 text=z.read('nlsy79_all_1979-2022.cdb').decode();D={}
 for b in re.split(r'\n-{30,}\n',text):
  m=re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)',b)
  if not m:continue
  k=m[1].replace('.','');n=m[2];y=m[3]
  keep=(k in ['R0000100','R6533500','R6533600','R6538600','R6538700'] or (y=='XRND' and re.fullmatch(r'(MO|YR)BG[1-7]M',n)) or (y.isdigit() and 2000<=int(y)<=2020 and (any(n.startswith(q) for q in ['HHI_FINAL_RELCODE.','HHI_FINAL_GENCODE.','HHI_FINAL_GRADECODE.','HHI_FINAL_STATCODE.']) or n in ['Q13-5','Q13-5_TRUNC','Q13-5_TRUNC_REVISED','Q13-18','Q13-18_TRUNC','Q13-18_TRUNC_REVISED','HGCREV'+y[2:],'Q3-4'])))
  if keep:D[k]={'ref':m[1],'name':n,'year':y,'block':b}
 with z.open('nlsy79_all_1979-2022.csv') as b,open(P/'pairing_nlsy_extract.csv','w') as out:
  rd=csv.reader(io.TextIOWrapper(b));h=next(rd);ix=[i for i,k in enumerate(h) if k in D];cols=[h[i] for i in ix];w=csv.writer(out);w.writerow(cols)
  for row in rd:w.writerow([row[i] for i in ix])
json.dump({k:D[k] for k in cols},open(P/'pairing_nlsy_codebook.json','w'),indent=2)
print('extracted',len(cols),'variables')
