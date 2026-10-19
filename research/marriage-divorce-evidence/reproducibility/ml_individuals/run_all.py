from pathlib import Path
import subprocess,sys
ROOT=Path(__file__).resolve().parent
for name in ['analyze_ml.py','compare_models.py','verify_models.py']:
 subprocess.run([sys.executable,str(ROOT/name)],check=True)
