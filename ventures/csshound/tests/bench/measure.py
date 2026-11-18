import resource, subprocess, sys, time
out = sys.argv[1]; cmd = sys.argv[2:]
t = time.time()
with open(out, 'wb') as f:
    p = subprocess.run(cmd, stdout=f, stderr=subprocess.PIPE)
dt = time.time() - t
r = resource.getrusage(resource.RUSAGE_CHILDREN)
sys.stderr.write(p.stderr.decode()[-2000:])
print(f"exit={p.returncode} wall_s={dt:.2f} user_s={r.ru_utime:.2f} sys_s={r.ru_stime:.2f} maxrss_mb={r.ru_maxrss/1024:.0f}")
