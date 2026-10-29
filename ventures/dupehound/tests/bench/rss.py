import resource, subprocess, sys, time
t = time.time(); r = subprocess.run(sys.argv[1:], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ru = resource.getrusage(resource.RUSAGE_CHILDREN)
print(f"rc={r.returncode} wall={time.time()-t:.3f}s user={ru.ru_utime:.2f}s sys={ru.ru_stime:.2f}s peak_rss_mb={ru.ru_maxrss/1024:.0f}")
