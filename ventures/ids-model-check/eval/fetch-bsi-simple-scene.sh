#!/bin/sh
# Fetches buildingSMART's Simple-Scene sample models (CC BY 4.0; three are
# committed in samples/bsi-ifc43/, the rest are not) next to this script,
# pinned to the commit eval/infra-mep-crosscheck-2026-11-17.md was measured on.
set -e
cd "$(dirname "$0")"
COMMIT=${BSI_COMMIT:-80d976a9b193a26a8e928c3e79bff67af1de68a8}
if [ ! -d bsi-samples ]; then
  git clone --filter=blob:none --no-checkout https://github.com/buildingSMART/Sample-Test-Files.git bsi-samples
fi
cd bsi-samples
git sparse-checkout set --no-cone '/IFC 4.3.2.0 (IFC 4.3 ADD2)/Simple-Scene/*' '/IFC 4.0.2.1 (IFC 4 ADD2 TC1)/Simple-Scene/Building-Hvac.ifc' '/IFC 2.3.0.1 (IFC 2x3 TC1)/Simple-Scene/Building-Hvac.ifc' '/LICENSE'
git fetch --depth 1 origin "$COMMIT" 2>/dev/null || git fetch origin
git checkout -q "$COMMIT"
echo "Simple-Scene models at $(pwd) ($(git rev-parse --short HEAD))"
