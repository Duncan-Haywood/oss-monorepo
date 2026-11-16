# Usage: measure.py OUTFILE COMMAND [ARG]...  (stdout goes to OUTFILE)
import os, resource, subprocess, sys, time
if len(sys.argv) < 3:
    sys.exit("usage: measure.py OUTFILE COMMAND [ARG]...")
out = sys.argv[1]; cmd = sys.argv[2:]
# Refuse to overwrite an executable: the usual slip is passing the command
# first, which used to truncate the binary being measured.
if os.path.isfile(out) and os.access(out, os.X_OK):
    sys.exit(f"measure.py: {out} is an executable; the first argument is the output file")
t = time.time()
with open(out, 'wb') as f:
    p = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
dt = time.time() - t
r = resource.getrusage(resource.RUSAGE_CHILDREN)
sys.stderr.write(p.stderr.decode()[-2000:])
print(f"exit={p.returncode} wall_s={dt:.2f} user_s={r.ru_utime:.2f} sys_s={r.ru_stime:.2f} maxrss_mb={r.ru_maxrss/1024:.0f}")
