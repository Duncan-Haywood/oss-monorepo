"""Write each XER as P6 XML (PMXML) with MPXJ's PrimaveraPMFileWriter, one
file per project (NAME.xml, or NAME-0.xml, NAME-1.xml... for a multi-project
XER), for eval/pmxml-check.mjs.

  pip install mpxj jpype1   (needs a Java runtime)
  python eval/xer-to-pmxml.py OUTDIR <file.xer ...>
"""
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
