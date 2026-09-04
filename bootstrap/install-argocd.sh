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
echo "Initial admin password:"
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath='{.data.password}' | base64 -d
echo
echo
echo "Do not expose this UI on :80/:443. Use: kubectl -n argocd port-forward svc/argocd-server 8080:443"
echo "If the GitOps repo is private, create a read-only repo Secret in argocd now."
echo "Then merge GitOps PRs. Do not kubectl apply platform/prod/agents by hand."
