"""Create and run first-marriage restricted sensitivity from joint code."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
s=(ROOT/'analyze_joint.py').read_text()
s=s.replace("ROOT=Path(__file__).resolve().parent", "ROOT=Path(__file__).resolve().parent\nOUT=ROOT/'first_marriage'\nOUT.mkdir(exist_ok=True)")
s=s.replace("'age_bin':list(range(7))", "'age_at_marriage':['22-26','<22','27-31','32-36','37+'],'duration':['5-9','1-4','10-19','20+']")
s=s.replace("for denominator in ['approx_current_married_separated_or_recent_divorce','ever_married']:", "d=d[(d.MARHT==1)&(d.MARHM!=1)].copy()\nd['duration_years']=2023-d.MARHYP\nd=d[d.duration_years>=1].copy()\nd['age_at_marriage_years']=d.AGEP-d.duration_years\nd['age_at_marriage']=pd.cut(d.age_at_marriage_years,[-np.inf,22,27,32,37,np.inf],right=False,labels=['<22','22-26','27-31','32-36','37+']).astype('str')\nd['duration']=pd.cut(d.duration_years,[1,5,10,20,np.inf],right=False,labels=['1-4','5-9','10-19','20+']).astype('str')\nlevels.pop('marriage_count')\nprofiles=[(label,{k:v for k,v in settings.items() if k!='marriage_count'}) for label,settings in profiles if 'twice' not in label]\nfor denominator in ['approx_current_married_separated_or_recent_divorce']:")
s=s.replace("ROOT/(name+'.csv')", "OUT/(name+'.csv')").replace("ROOT/'checks.json'", "OUT/'checks.json'")
s=s.replace("age and race averaged over eligible population within sex", "age at marriage, duration, race averaged over eligible first-married population within sex")
(ROOT/'analyze_first_marriage.py').write_text(s)
