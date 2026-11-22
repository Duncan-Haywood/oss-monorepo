import sys,json,io,logging
logging.disable(logging.CRITICAL)
sys.path.insert(0, sys.argv[1]+'/pydotenv/x')
from dotenv import dotenv_values
files=json.load(open(sys.argv[2]))
out=[]
for t in files:
    d=dotenv_values(stream=io.StringIO(t))
    out.append({'all':sorted(d.keys()),'valued':sorted(k for k,v in d.items() if v is not None)})
json.dump(out,open(sys.argv[3],'w'))
