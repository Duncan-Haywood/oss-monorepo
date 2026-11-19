#!/usr/bin/env python3
# Counts, per IFC schema, the objects of IFC 4.3's deprecated element classes
# (IFCWALLSTANDARDCASE, IFCELECTRICDISTRIBUTIONBOARD and its type) and of the
# classes they sit under, in every .ifc STEP file below the folders given.
# Writes scan.json in the current directory; see
# eval/deprecated-subclasses-2026-11-19.md for the folders and the result.
#   python3 -I eval/deprecated-in-models.py <folder>...
import sys,re,os,collections,json
DEP={'IFCWALLSTANDARDCASE','IFCELECTRICDISTRIBUTIONBOARD','IFCELECTRICDISTRIBUTIONBOARDTYPE'}
SC=re.compile(rb"^\s*#\d+\s*=\s*(IFC[A-Z0-9]+)\s*\(",re.M)
rows=[]
for root in sys.argv[1:]:
  for dp,_,fs in os.walk(root):
    for f in fs:
      if not f.lower().endswith('.ifc'): continue
      p=os.path.join(dp,f); b=open(p,'rb').read()
      m=re.search(rb"FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'",b); sch=m.group(1).decode().upper() if m else '?'
      app=re.search(rb"FILE_NAME\s*\((.*?)\);",b,re.S); app=app.group(1)[:300].decode('latin1') if app else ''
      c=collections.Counter(x.decode() for x in SC.findall(b))
      rows.append(dict(path=p,schema=sch,size=len(b),counts={k:v for k,v in c.items() if k.endswith('STANDARDCASE') or k.endswith('ELEMENTEDCASE') or k in DEP or k in('IFCWALL','IFCSLAB','IFCBEAM','IFCCOLUMN','IFCDISTRIBUTIONBOARD','IFCDOORSTYLE','IFCWINDOWSTYLE','IFCDOOR','IFCWINDOW','IFCMEMBER','IFCPLATE','IFCOPENINGELEMENT')},app=app))
json.dump(rows,open('scan.json','w'),indent=0)
