"""Select prospective annual-analysis fields from official NLSY79 full archive."""
import pathlib,json,re,zipfile,csv,io,urllib.request
P=pathlib.Path(__file__).resolve().parent
Z=P.parent/'longitudinal/nlsy79_all_1979-2022.zip'
if not Z.exists():
 Z=P/'nlsy79_all_1979-2022.zip'
 if not Z.exists():urllib.request.urlretrieve('https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip',Z)
with zipfile.ZipFile(Z) as z:
 text=z.read('nlsy79_all_1979-2022.cdb').decode();D={}
 for b in re.split(r'\n-{30,}\n',text):
  m=re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)',b)
  if not m:continue
  k=m[1].replace('.','');n=m[2];y=m[3]
  keep=(k in ['R0000100','R0214800','R0214700','R0000500','R9908600','R6533600','T3201400'] or (y!='XRND' and n in ['Q3-10B','Q3-10D']) or (y.isdigit() and int(y)>=2000 and (n in ['MARSTAT-KEY','SAMPWEIGHT','CURDATE~M','CURDATE~Y','TNFI_TRUNC','HRSWK-PCY','AGEATINT','DOI_EMPLOYED','Q3-4','Q13-5_TRUNC','Q13-18_TRUNC'] or n.startswith('MARST-CHNG') or n.startswith('HGCREV'))))
  if keep:D[k]={'ref':m[1],'name':n,'year':y,'block':b}
 with z.open('nlsy79_all_1979-2022.csv') as b,open(P/'annual_nlsy_extract.csv','w') as out:
  rd=csv.reader(io.TextIOWrapper(b));h=next(rd);ix=[i for i,k in enumerate(h) if k in D];cols=[h[i] for i in ix];w=csv.writer(out);w.writerow(cols)
  for row in rd:w.writerow([row[i] for i in ix])
json.dump({k:D[k] for k in cols},open(P/'annual_nlsy_codebook.json','w'),indent=2)
print('extracted',len(cols),'variables')
