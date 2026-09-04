#!/usr/bin/env bash
# One-time Argo CD install on the k3s server, then the root Application.
# After this script, cluster desired state comes from gitops/ via Argo.
set -euo pipefail

ARGOCD_VERSION="${ARGOCD_VERSION:-v3.5.1}"
KUBECONFIG="${KUBECONFIG:-/etc/rancher/k3s/k3s.yaml}"
export KUBECONFIG

ROOT_APP="$(dirname "$(readlink -f "$0")")/root-application.yaml"

if [[ ! -f /etc/rancher/k3s/k3s.yaml ]]; then
  echo "k3s kubeconfig missing — run install-k3s-server.sh first" >&2
  exit 1
fi

kubectl get ns argocd >/dev/null 2>&1 || kubectl create namespace argocd

kubectl apply -n argocd --server-side --force-conflicts \
  -f "https://raw.githubusercontent.com/argoproj/argo-cd/${ARGOCD_VERSION}/manifests/install.yaml"

kubectl -n argocd rollout status deploy/argocd-server --timeout=300s

kubectl apply -f "$ROOT_APP"

echo
echo "Argo CD is installed and the root Application is applied."

# Printing the initial admin password unconditionally was safe while this
# script only ever ran from a laptop over an interactive SSH session, which is
# what its header still assumes. `restore-cluster.sh` can now run it from a
# GitHub Actions runner, and there the same `echo` writes a live cluster-admin
# credential into a workflow log that every repository collaborator can read
# and that outlives the session. Retrieval is one kubectl away for anyone who
# genuinely has the cluster, so the default is now to say where it lives rather
# than to print it.
if [[ "${PRINT_ADMIN_PASSWORD:-0}" == "1" ]]; then
  echo "Initial admin password:"
  kubectl -n argocd get secret argocd-initial-admin-secret \
    -o jsonpath='{.data.password}' | base64 -d
  echo
else
  echo "Initial admin password (not printed — read it on the box with):"
  echo "  kubectl -n argocd get secret argocd-initial-admin-secret \\"
  echo "    -o jsonpath='{.data.password}' | base64 -d"
fi
echo
echo "Do not expose this UI on :80/:443. Use: kubectl -n argocd port-forward svc/argocd-server 8080:443"
echo "If the GitOps repo is private, create a read-only repo Secret in argocd now."
echo "Then merge GitOps PRs. Do not kubectl apply platform/prod/agents by hand."
