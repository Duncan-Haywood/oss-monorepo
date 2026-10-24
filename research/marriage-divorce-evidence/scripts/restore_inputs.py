from pathlib import Path,PurePosixPath
import argparse,zipfile
p=argparse.ArgumentParser();p.add_argument('bundle');a=p.parse_args();root=Path(__file__).resolve().parents[1]
with zipfile.ZipFile(a.bundle) as z:
 candidates=[]
 for info in z.infolist():
  parts=PurePosixPath(info.filename).parts
  if info.is_dir():continue
  if '..' in parts or PurePosixPath(info.filename).is_absolute():raise SystemExit('Unsafe archive path')
  if 'reproducibility' not in parts:continue
  pos=parts.index('reproducibility');relative=Path(*parts[pos:])
  target=(root/relative).resolve()
  if root not in target.parents:raise SystemExit('Unsafe archive destination')
  # Restore only record-level inputs omitted from Git, not source/code overrides.
  name=target.name
  if not (target.suffix in {'.parquet','.dat','.dct'} or any(t in name for t in ['extract','_input','interval','segment','predictions','baseline','respondent_folds'])):continue
  candidates.append((info,target))
 for info,target in candidates:
  target.parent.mkdir(parents=True,exist_ok=True)
  with z.open(info) as src,target.open('wb') as dst:
   import shutil;shutil.copyfileobj(src,dst)
print(f'Restored {len(candidates)} local analytical input files.')
