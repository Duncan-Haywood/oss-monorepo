from pathlib import Path
import pandas as pd,numpy as np,json
P=Path(__file__).resolve().parent;W=['PWGTP']+[f'PWGTP{i}' for i in range(1,81)]
d=pd.read_parquet(P.parent/'acs/persons_30_64.parquet',columns=['AGEP','SEX','SCHL','MAR','MARHD']+W);d=d[d.SCHL.isin([21,22,23,24])&(d.MAR.isin([1,4])|(d.MARHD==1))]
a=pd.read_csv(P/'replicate_aggregate_totals.csv.gz');r=pd.read_csv(P/'degree_occupation_annual_descriptive.csv')
checks=dict(n_matches_original_compact=int(r.n.sum())==len(d),events_match_original_compact=int(r.events.sum())==int((d.MARHD==1).sum()),all81_denominator_totals_match=bool(np.allclose(a[['d_'+c for c in W]].sum().to_numpy(),d[W].sum().to_numpy())),all81_event_totals_match=bool(np.allclose(a[['e_'+c for c in W]].sum().to_numpy(),d.loc[d.MARHD==1,W].sum().to_numpy())),no_unmapped_occupation='Unmapped occupation code' not in set(r.occupation),all_predetermined_cells=int(len(r))==80)
assert all(checks.values()),checks
(P/'validation.json').write_text(json.dumps(checks,indent=2));print(checks)
