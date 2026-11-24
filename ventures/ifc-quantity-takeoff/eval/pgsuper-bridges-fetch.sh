#!/usr/bin/env bash
# The three BridgeLink PGSuper 8 IFC4X3 bridge exports used in
# eval/pgsuper-bridges-2026-11-24.md, from RickBrice/IfcAlignmentDriver
# (WSDOT's PGSuper author's IfcOpenShell alignment test bed). That repository
# carries no licence, so the files are fetched for testing, not copied here.
#   bash eval/pgsuper-bridges-fetch.sh DIR
set -euo pipefail
dir=${1:?usage: pgsuper-bridges-fetch.sh DIR}
mkdir -p "$dir"
base=https://raw.githubusercontent.com/RickBrice/IfcAlignmentDriver/HEAD
for p in TestFiles/I405-SR167.Flyover.ifc TestFiles/LargeSpirals/IFC_Alignment4_Br1.ifc Notebooks/PGSuperExport.ifc; do
  curl -sSfL -o "$dir/$(basename "$p")" "$base/$p"
done
ls -l "$dir"
