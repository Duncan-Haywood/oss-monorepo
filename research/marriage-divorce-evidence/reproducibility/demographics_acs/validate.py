from pathlib import Path
import pandas as pd,numpy as np,json
p=Path(__file__).resolve().parent
a=pd.read_csv(p/'age_sex_cell_totals.csv.gz');checks={}
for pop in a.population.unique():
 total=a[(a.population==pop)&(a.dimension=='overall')]
 for dim in ['race_ethnicity','nativity','citizenship']:
  d=a[(a.population==pop)&(a.dimension==dim)]
  for prefix in ['d','e']:
   checks[f'{pop}_{dim}_{prefix}_all_replicate_totals']=bool(np.allclose(d.filter(regex='^'+prefix+'_PWGTP').sum(),total.filter(regex='^'+prefix+'_PWGTP').sum()))
 fb=a[(a.population==pop)&(a.dimension=='nativity')&(a.group=='Foreign born')]
 for dim in ['birth_region','entry_duration']:
  d=a[(a.population==pop)&(a.dimension==dim)]
  for prefix in ['d','e']:
   checks[f'{pop}_{dim}_{prefix}_foreign_all_replicates']=bool(np.allclose(d.filter(regex='^'+prefix+'_PWGTP').sum(),fb.filter(regex='^'+prefix+'_PWGTP').sum()))
assert all(checks.values())
(p/'validation.json').write_text(json.dumps(checks,indent=2));print('All',len(checks),'replicate partition identity checks passed')
