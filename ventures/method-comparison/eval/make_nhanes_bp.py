import pandas as pd, sys
nh, out = sys.argv[1], sys.argv[2]
a=pd.read_sas(f'{nh}/BPX_J.xpt',format='xport'); b=pd.read_sas(f'{nh}/BPXO_J.xpt',format='xport')
d=pd.read_sas(f'{nh}/DEMO_J.xpt',format='xport')[['SEQN','RIDAGEYR']]
m=a.merge(b,on='SEQN').merge(d,on='SEQN')
m=m[m.RIDAGEYR>=18]
cols=['BPXSY1','BPXSY2','BPXSY3','BPXOSY1','BPXOSY2','BPXOSY3']
c=m.dropna(subset=cols).sort_values('SEQN')
merc=c[cols[:3]].mean(axis=1); osc=c[cols[3:]].mean(axis=1)
with open(out,'w',newline='\n') as f:
    f.write('seqn,mercury_sbp,oscillometric_sbp\n')
    for s,x,y in zip(c.SEQN,merc,osc):
        f.write(f'{int(s)},{x:.2f},{y:.2f}\n'.replace('.00,',',').replace('.00\n','\n'))
print(len(c))
