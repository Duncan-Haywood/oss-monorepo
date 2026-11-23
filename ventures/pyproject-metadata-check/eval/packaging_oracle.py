"""Reads {"kind", "s"} JSON lines on stdin and prints packaging's answer for each.

kind: version | specset | requirement | license. Needs packaging>=26.
"""
import json, sys
from packaging.version import Version, InvalidVersion
from packaging.specifiers import SpecifierSet, InvalidSpecifier
from packaging.requirements import Requirement, InvalidRequirement
from packaging.licenses import canonicalize_license_expression, InvalidLicenseExpression

for line in sys.stdin:
    q = json.loads(line)
    k, s = q["kind"], q["s"]
    try:
        if k == "version":
            r = {"ok": str(Version(s))}
        elif k == "specset":
            r = {"ok": len(SpecifierSet(s))}
        elif k == "requirement":
            req = Requirement(s)
            r = {"ok": {"name": req.name, "extras": sorted(req.extras), "url": req.url or "", "nspec": len(req.specifier), "marker": req.marker is not None}}
        elif k == "license":
            r = {"ok": canonicalize_license_expression(s)}
        else:
            raise SystemExit("unknown kind " + k)
    except (InvalidVersion, InvalidSpecifier, InvalidRequirement, InvalidLicenseExpression) as e:
        r = {"error": str(e).splitlines()[0]}
    print(json.dumps(r))
