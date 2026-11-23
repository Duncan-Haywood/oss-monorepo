import sys, os, jpype, mpxj  # noqa
jpype.startJVM()
from org.mpxj.reader import UniversalProjectReader
from org.mpxj.primavera import PrimaveraPMFileWriter, PrimaveraXERFileReader
for src in sys.argv[2:]:
    r = PrimaveraXERFileReader()
    projects = r.readAll(src)
    for k, p in enumerate(projects):
        out = os.path.join(sys.argv[1], os.path.basename(src)[:-4] + (f"-{k}" if len(projects) > 1 else "") + ".xml")
        PrimaveraPMFileWriter().write(p, out)
        print(out, p.getTasks().size())
