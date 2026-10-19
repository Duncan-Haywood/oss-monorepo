"""Stream official NLSY79 archive to reproducible compact extract. Python standard library only."""
import zipfile,json,csv,io,re,pathlib,hashlib
P=pathlib.Path(__file__).resolve().parent
Z=P/'nlsy79_all_1979-2022.zip'
if not Z.exists():
 import urllib.request
 urllib.request.urlretrieve('https://nlsinfo.org/cohort-data/nlsy79_all_1979-2022.zip', Z)
with zipfile.ZipFile(Z) as z:
 text=z.read('nlsy79_all_1979-2022.cdb').decode()
D={}
for block in re.split(r'\n-{30,}\n',text):
 m=re.match(r'([A-Z]\d{5}\.\d{2})\s+\[([^]]+)\].*?Survey Year: (\S+)',block)
 if m:D[m[1].replace('.','')]={'ref':m[1],'name':m[2],'year':m[3],'block':block}
keep={}
for k,v in D.items():
 n=v['name'];yr=v['year']
 if k in ['R0000100','R0000500','R0214800','R0214700','T9900100','T9299300','T9300300','R9908800','R9909000','R0012800','T9900000','R0173600'] or (yr=='2000' and n in ['TNFI_TRUNC','Q13-5_TRUNC','HRSWK-PCY','HGC_EVER','SAMPWEIGHT']) or n=='MARSTAT-KEY' or n.startswith('MARST-CHNG') or re.fullmatch(r'Q2-5A1(?:_[123]|\.0[123])',n):keep[k]=v
with zipfile.ZipFile(Z) as z, z.open('nlsy79_all_1979-2022.csv') as b, open(P/'nlsy79_extract.csv','w') as out:
 rd=csv.reader(io.TextIOWrapper(b)); h=next(rd); inds=[i for i,k in enumerate(h) if k in keep]; cols=[h[i] for i in inds];w=csv.writer(out);w.writerow(cols)
 for line in rd:w.writerow([line[i] for i in inds])
json.dump({k:keep[k] for k in cols},open(P/'nlsy79_selected_codebook.json','w'),indent=2)
print(len(cols),'columns extracted')
